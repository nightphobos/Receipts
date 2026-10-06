describe("test harness", () => {
  it("runs TypeScript tests in node env", () => {
    const sum: number = [1, 2, 3].reduce((a, b) => a + b, 0);
    expect(sum).toBe(6);
  });
});
