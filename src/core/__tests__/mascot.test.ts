import {
  MASCOT_PIXELS,
  MASCOT_POSES,
  MASCOT_POSE_NAMES,
  mascotLine,
  mascotRuns,
  poseForStatus,
} from "../mascot";

describe("MASCOT_POSES", () => {
  it("has the five spec poses", () => {
    expect([...MASCOT_POSE_NAMES].sort()).toEqual(["cheer", "cry", "eat", "idle", "print"]);
  });

  it.each(MASCOT_POSE_NAMES)("%s is a 16×16 grid of known pixel codes", (name) => {
    const grid = MASCOT_POSES[name];
    expect(grid).toHaveLength(16);
    for (const row of grid) {
      expect(row).toHaveLength(16);
      for (const ch of row) expect(ch === "." || ch in MASCOT_PIXELS).toBe(true);
    }
  });

  it("every pose is a purple cash register with a display, eyes and paper", () => {
    for (const name of MASCOT_POSE_NAMES) {
      const all = MASCOT_POSES[name].join("");
      for (const code of ["B", "S", "E", "P"]) expect(all).toContain(code);
    }
  });

  it("poses are all different", () => {
    const keys = MASCOT_POSE_NAMES.map((n) => MASCOT_POSES[n].join("\n"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("print pose has more paper than idle; cry has tears", () => {
    const count = (s: string, ch: string) => s.split(ch).length - 1;
    expect(count(MASCOT_POSES.print.join(""), "P")).toBeGreaterThan(count(MASCOT_POSES.idle.join(""), "P"));
    expect(MASCOT_POSES.cry.join("")).toContain("T");
  });
});

describe("mascotRuns", () => {
  it("merges horizontal runs of the same code and skips empty cells", () => {
    expect(mascotRuns(["..BBS.", "P....P"])).toEqual([
      { x: 2, y: 0, w: 2, code: "B" },
      { x: 4, y: 0, w: 1, code: "S" },
      { x: 0, y: 1, w: 1, code: "P" },
      { x: 5, y: 1, w: 1, code: "P" },
    ]);
  });

  it("covers exactly the non-empty cells of every pose", () => {
    for (const name of MASCOT_POSE_NAMES) {
      const grid = MASCOT_POSES[name];
      const filled = grid.join("").replace(/\./g, "").length;
      const runs = mascotRuns(grid);
      expect(runs.reduce((n, r) => n + r.w, 0)).toBe(filled);
      for (const r of runs) expect(grid[r.y].slice(r.x, r.x + r.w)).toBe(r.code.repeat(r.w));
    }
  });
});

describe("poseForStatus", () => {
  it("cheers on HIT, cries on any miss, idles otherwise", () => {
    expect(poseForStatus("hit")).toBe("cheer");
    expect(poseForStatus("miss")).toBe("cry");
    expect(poseForStatus("forfeited")).toBe("cry");
    expect(poseForStatus("overlap")).toBe("cry");
    for (const s of ["sealed", "awaiting_reveal", "unresolved", "void", "legacy"] as const)
      expect(poseForStatus(s)).toBe("idle");
  });

  it("prints while a reveal is on its way", () => {
    expect(poseForStatus("awaiting_reveal", { printing: true })).toBe("print");
    expect(poseForStatus("unresolved", { printing: true })).toBe("print");
    expect(poseForStatus("hit", { printing: true })).toBe("cheer");
  });
});

describe("mascotLine", () => {
  it("idle asks the spec question", () => {
    expect(mascotLine("idle", { asset: "SOL", horizon: "24h" })).toBe(
      "Where will SOL be in 24h? I'll print your receipt.",
    );
    expect(mascotLine("idle", { asset: "SOL", horizon: "1h" })).toBe(
      "Where will SOL be in 1h? I'll print your receipt.",
    );
    expect(mascotLine("idle", { asset: "SKR", horizon: "skr-daily" })).toBe(
      "Where will SKR be at 12:00 UTC? I'll print your receipt.",
    );
  });

  it("has a line for every pose", () => {
    for (const name of MASCOT_POSE_NAMES) expect(mascotLine(name, { asset: "SKR", horizon: "3d" }).length).toBeGreaterThan(0);
  });
});
