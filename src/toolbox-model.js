export function filterTools(
  actions,
  { query = "", category = "", favorites = null, available = true } = {},
) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return actions.filter((action) => {
    const text = [
      action.name,
      action.description,
      action.category,
      ...action.groups,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!category || action.category === category) &&
      (!available || action.available) &&
      (!favorites || favorites.includes(action.id)) &&
      terms.every((term) => text.includes(term))
    );
  });
}
export function setupTools(actions, workflow) {
  return actions.filter((a) =>
    workflow === "myfish"
      ? a.groups.includes("Myfish Shell Setup")
      : workflow === "dotfiles"
        ? a.groups.includes("Dotfiles")
        : a.category === "Applications Setup" &&
          !a.groups.includes("Myfish Shell Setup") &&
          !a.groups.includes("Dotfiles"),
  );
}

export function taskLabels(flags = "") {
  const labels = {
    D: "Disk changes (privileged)",
    FI: "Flatpak installation",
    FM: "File changes",
    I: "Installation (privileged)",
    K: "Kernel changes (privileged)",
    MP: "Package manager",
    SI: "Full system installation",
    SS: "Systemd changes (privileged)",
    RP: "Package removal",
  };
  return flags
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (flag) =>
        labels[flag] ||
        (flag.startsWith("P") && labels[flag.slice(1)]
          ? `${labels[flag.slice(1)]} (privileged)`
          : flag),
    )
    .join(" · ");
}

export function toolboxHint(tool) {
  if (tool.name === "Toolbox Updater")
    return "Updates the standalone Toolbox checkout and executable. Command Center's bundled catalog updates when Command Center is rebuilt.";
  if (tool.name === "Installation History")
    return "Opens standalone Toolbox history. Runs started here are recorded in Command Center Activity.";
  return "";
}
