/** MariaDB may prefix its version with the MySQL protocol compatibility version. */
export function supportedEngine(version, comment = "") {
  const maria = /mariadb/i.test(version + " " + comment)
  const match = maria ? version.match(/(\d+\.\d+\.\d+)(?=-MariaDB)/i) ?? version.match(/\d+\.\d+\.\d+/) : version.match(/\d+\.\d+\.\d+/)
  if (!match) throw new Error("Unrecognised database version")
  const actual = (match[1] ?? match[0]).split(".").map(Number)
  const minimum = maria ? [10, 6, 0] : [8, 0, 16]
  const supported = actual.some((part, i) => actual.slice(0, i).every((prior, j) => prior === minimum[j]) && part > minimum[i]) || actual.every((part, i) => part === minimum[i])
  if (!supported) throw new Error("Unsupported database: requires MySQL >=8.0.16 or MariaDB >=10.6")
  return { engine: maria ? "mariadb" : "mysql", version: actual.join(".") }
}
