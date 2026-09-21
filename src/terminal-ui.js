import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export function createTerminal({ $, run, guard, review, toast, switchView }) {
  let terminal,
    fit,
    id,
    cursor = 0,
    generation = 0,
    polling = false;
  let finished = false,
    started = 0,
    sized = false,
    input = Promise.resolve();
  const status = (text) => {
    $("#terminal-status").textContent = text;
  };
  function resize() {
    if (!terminal || !$("#terminal-view").classList.contains("active-view"))
      return;
    fit.fit();
    if (!finished)
      void run("terminal_resize", {
        id,
        cols: terminal.cols,
        rows: terminal.rows,
      }).catch(() => {});
  }
  function initialize() {
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "monospace",
      scrollback: 3000,
      theme: {
        background: "#10151e",
        foreground: "#dbe6f3",
        cursor: "#70e1dd",
      },
      allowProposedApi: false,
    });
    fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open($("#embedded-terminal"));
    const send = (bytes) => {
      if (!id || finished) return;
      if (bytes.length > 65536) {
        toast("Paste up to 64 KB at a time in the terminal.", true);
        return;
      }
      const target = id;
      let rejected = false;
      // Preserve paste/key order, cap each IPC message, and never log input.
      for (let offset = 0; offset < bytes.length; offset += 4096) {
        const data = Array.from(bytes.slice(offset, offset + 4096));
        input = input
          .then(() =>
            target === id && !finished && !rejected
              ? run("terminal_write", { id: target, data })
              : undefined,
          )
          .catch((error) => {
            rejected = true;
            status(String(error));
            toast(String(error), true);
          });
      }
    };
    terminal.onData((data) => send(new TextEncoder().encode(data)));
    terminal.onBinary((data) =>
      send(Uint8Array.from(data, (c) => c.charCodeAt(0) & 255)),
    );
    new ResizeObserver(resize).observe($("#embedded-terminal"));
    setInterval(() => void poll(), 100);
  }
  async function poll() {
    if (!id || polling || finished) return;
    polling = true;
    const version = generation;
    try {
      const result = await run("terminal_read", { id, cursor });
      if (version !== generation) return;
      if (result.running && !sized) {
        resize();
        sized = true;
      }
      if (result.truncated) {
        terminal.reset();
        terminal.writeln(
          "[Earlier output exceeded the in-memory limit and was omitted.]",
        );
      }
      if (result.bytes.length) {
        await new Promise((resolve) =>
          terminal.write(new Uint8Array(result.bytes), resolve),
        );
        if (version !== generation) return;
      }
      cursor = result.cursor;
      finished = !result.running && !result.bytes.length;
      terminal.options.disableStdin = finished;
      status(
        finished
          ? "Session finished · output stays in memory until another session or app exit."
          : "Live session · click below to type. Passwords may not echo.",
      );
      $("#terminal-stop").disabled = !result.running;
    } catch (error) {
      if (version !== generation) return;
      if (Date.now() - started > 5000) {
        finished = true;
        terminal.options.disableStdin = true;
        $("#terminal-stop").disabled = true;
        status(String(error));
      }
    } finally {
      polling = false;
    }
  }
  function open(jobId, title) {
    switchView("terminal");
    if (!terminal) initialize();
    if (id !== jobId) {
      id = jobId;
      cursor = 0;
      generation++;
      finished = false;
      started = Date.now();
      sized = false;
      status("Connecting to terminal…");
      terminal.reset();
      terminal.options.disableStdin = false;
    }
    $("#terminal-title").textContent = title;
    requestAnimationFrame(() => {
      resize();
      terminal.focus();
      void poll();
    });
  }
  $("#terminal-stop").addEventListener(
    "click",
    guard(async () => {
      if (!id || finished) return;
      if (
        await review(
          "Stop this workflow?",
          "Stopping an installer can leave partial changes. Check its output before retrying.",
          $("#terminal-title").textContent,
          "Stop workflow",
        )
      ) {
        await run("cancel_job", { id });
        status("Stopping workflow…");
      }
    }),
  );
  $("#terminal-save").addEventListener(
    "click",
    guard(async () => {
      if (!id) return;
      if (
        await review(
          "Save terminal output?",
          "This explicitly saves up to 1 MB of terminal output to a private local file. Review it for secrets before sharing.",
          $("#terminal-title").textContent,
          "Save output",
        )
      ) {
        const path = await run("terminal_export", { id });
        status(`Saved output: ${path}`);
        toast("Terminal output saved");
      }
    }),
  );
  return {
    open,
    onView: (view) => {
      if (view === "terminal") requestAnimationFrame(resize);
    },
  };
}
