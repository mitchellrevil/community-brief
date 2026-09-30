const enabledValues = new Set(["1", "true", "yes", "on"]);

const readBooleanFeatureFlag = (value: string | boolean | undefined) => {
  if (typeof value === "boolean") {
    return value;
  }

  return enabledValues.has(String(value ?? "").trim().toLowerCase());
};

export const isHelpPageEnabled = readBooleanFeatureFlag(
  import.meta.env.VITE_ENABLE_HELP_PAGE,
);
