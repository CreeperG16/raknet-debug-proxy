import { BinaryStream } from "@serenityjs/binarystream";
import { createSocket } from "node:dgram";
import { readFrameset } from "./fram";
import * as fs from "node:fs";

const HOST_PORT = 19132;
const DEST_PORT = 25565;

const logfile = process.argv.includes("--logfile");

const server = createSocket("udp4");
server.bind(HOST_PORT);

const client = createSocket("udp4");
client.connect(DEST_PORT, "127.0.0.1");
//client.connect(19132);

let connectedClientInfo = { address: "", port: 0 };

const PacketIDs = {
  [0x00]: "ConnectedPing",
  [0x01]: "UnconnectedPing",
  [0x03]: "ConnectedPong",
  [0x05]: "OpenConnectionRequest1",
  [0x06]: "OpenConnectionReply1",
  [0x07]: "OpenConnectionRequest2",
  [0x08]: "OpenConnectionReply2",
  [0x09]: "ConnectionRequest",
  [0x10]: "ConnectionRequestAccepted",
  [0x13]: "NewIncomingConnection",
  [0x15]: "Disconnect",
  [0x19]: "IncompatibleProtocolVersion",
  [0x1c]: "UnconnectedPong",
  [0x80]: "FrameSet",
  [0xc0]: "Ack",
  [0xa0]: "Nack",
  [0xfe]: "GamePacket",
};

const LOGFILENAME = (new Date().toLocaleString().replace(/[\/, :]+/g, "-")) + ".log"

function log(msg: string): void {
  console.log(msg.length > 150 ? msg.substring(0, 147) + "..." : msg);
  if (logfile) fs.appendFileSync(LOGFILENAME, msg + "\n");
}

server.on("message", (msg, { address, port }) => {
  try {
    let packetName = PacketIDs[msg[0] as keyof typeof PacketIDs];
    if ((msg[0] & 0xf0) === 0x80) packetName = PacketIDs[0x80];

    const packetLen = msg.byteLength.toString(10).padStart(5, " ");

    let packetHex = [...msg].map((x) => x.toString(16).padStart(2, "0")).join(" ");

    log(`S <-   | ${packetName.padEnd(30, " ")} | ${packetLen} | ${packetHex}`);

    if (packetName === "FrameSet") {
      const { frames } = readFrameset(new BinaryStream(msg));
      for (const frame of frames) {
        const framedPacketName = (
          PacketIDs[frame.payload[0] as keyof typeof PacketIDs] + (frame.isFragmented() ? " (S)" : "")
        ).padEnd(25, " ");
        const packetLen = frame.payload.byteLength.toString(10).padStart(5, " ");
        let packetHex = [...frame.payload].map((x) => x.toString(16).padStart(2, "0")).join(" ");
        //if (packetHex.length > 101) packetHex = packetHex.substring(0, 101) + "...";
        log(`  <-   |   ${framedPacketName.padEnd(28, " ")} | ${packetLen} | ${packetHex}`);
      }
    }
  } catch (e) {
    log("  Err  | " + msg[0].toString(16).padStart(2, "0") + " | " + (e as any).message);
  }

  client.send(msg);

  connectedClientInfo = { address, port };
});

client.on("message", (msg) => {
  try {
    let packetName = PacketIDs[msg[0] as keyof typeof PacketIDs];
    if ((msg[0] & 0xf0) === 0x80) packetName = PacketIDs[0x80];

    const packetLen = msg.byteLength.toString(10).padStart(5, " ");

    let packetHex = [...msg].map((x) => x.toString(16).padStart(2, "0")).join(" ");

    log(`  -> C | ${packetName.padEnd(30, " ")} | ${packetLen} | ${packetHex}`);

    if (packetName === "FrameSet") {
      const { frames } = readFrameset(new BinaryStream(msg));
      for (const frame of frames) {
        const packetName = (
          PacketIDs[frame.payload[0] as keyof typeof PacketIDs] + (frame.isFragmented() ? " (S)" : "")
        ).padEnd(25, " ");
        const packetLen = frame.payload.byteLength.toString(10).padStart(5, " ");
        let packetHex = [...frame.payload].map((x) => x.toString(16).padStart(2, "0")).join(" ");
        log(`  ->   |   ${packetName.padEnd(28, " ")} | ${packetLen} | ${packetHex}`);
      }
    }
  } catch (e) {
    log("  Err  | " + msg[0].toString(16).padStart(2, "0") + " | " + (e as any).message);
  }

  server.send(msg, connectedClientInfo.port, connectedClientInfo.address);
});

log(`Proxy ready - server on port ${HOST_PORT}, connecting to port ${DEST_PORT}`);
