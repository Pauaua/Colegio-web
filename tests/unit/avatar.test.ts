import { describe, expect, it } from "vitest";

import { avatarUrl, buildAvatarKey, initials } from "@/lib/avatar";
import { AVATAR_KEY_PATTERN, FILE_KEY_PATTERN } from "@/lib/storage";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("foto de perfil", () => {
  it("genera claves avatars/{uuid}.jpg válidas", () => {
    const key = buildAvatarKey(UUID);
    expect(key).toBe(`avatars/${UUID}.jpg`);
    expect(AVATAR_KEY_PATTERN.test(key)).toBe(true);
    // No se confunde con la clave de un documento.
    expect(FILE_KEY_PATTERN.test(key)).toBe(false);
  });

  it("rechaza claves con otra extensión o path traversal", () => {
    expect(AVATAR_KEY_PATTERN.test(`avatars/${UUID}.png`)).toBe(false);
    expect(AVATAR_KEY_PATTERN.test(`avatars/../${UUID}.jpg`)).toBe(false);
    expect(AVATAR_KEY_PATTERN.test(`avatars/${UUID}xjpg`)).toBe(false);
  });

  it("la URL cambia con cada foto y es null sin foto", () => {
    expect(avatarUrl("u1", null)).toBeNull();
    expect(avatarUrl("u1", buildAvatarKey(UUID))).toBe("/api/users/u1/avatar?v=0f8fad5b");
  });

  it("iniciales de hasta dos palabras", () => {
    expect(initials("Paula Contreras Díaz")).toBe("PC");
    expect(initials("  ana ")).toBe("A");
  });
});
