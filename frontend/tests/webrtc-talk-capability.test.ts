import { describe, expect, it } from "vitest";

import { answerAcceptsOutgoingAudio } from "../src/core/webrtc-peer-connection";

const audioAnswer = (direction: string, port = 9): string =>
  `v=0\r\nm=audio ${port} UDP/TLS/RTP/SAVPF 111\r\na=${direction}\r\n`;

describe("WebRTC two-way-audio answer capability", () => {
  it.each(["recvonly", "sendrecv"])(
    "accepts a remote %s audio direction",
    (direction) => {
      expect(answerAcceptsOutgoingAudio(audioAnswer(direction))).toBe(true);
    },
  );

  it.each(["sendonly", "inactive"])(
    "rejects a remote %s audio direction",
    (direction) => {
      expect(answerAcceptsOutgoingAudio(audioAnswer(direction))).toBe(false);
    },
  );

  it("rejects a disabled audio media section", () => {
    expect(answerAcceptsOutgoingAudio(audioAnswer("recvonly", 0))).toBe(false);
  });

  it("uses the session direction when the audio section omits one", () => {
    expect(
      answerAcceptsOutgoingAudio(
        "v=0\r\na=recvonly\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
      ),
    ).toBe(true);
  });
});
