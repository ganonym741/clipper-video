export function serializeJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested
    )
  ) as T;
}
