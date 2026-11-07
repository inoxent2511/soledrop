import { BlockList, isIP } from "node:net"

/** Empty configuration disables restrictions. Invalid rules fail startup, never fail open. */
export function adminNetworkPolicy(configuration: string) {
  const rules = configuration.split(",").map((rule) => rule.trim()).filter(Boolean), list = new BlockList()
  if (rules.length > 100) throw new Error("ADMIN_IP_ALLOWLIST supports at most 100 IP/CIDR rules")
  for (const rule of rules) {
    const [address, prefix, extra] = rule.split("/"), family = isIP(address)
    if (!family || extra !== undefined) throw new Error("ADMIN_IP_ALLOWLIST contains an invalid IP/CIDR")
    const type = family === 4 ? "ipv4" : "ipv6", bits = family === 4 ? 32 : 128
    if (prefix === undefined) list.addAddress(address, type)
    else {
      const count = Number(prefix)
      if (!/^\d+$/.test(prefix) || !Number.isInteger(count) || count < 0 || count > bits) throw new Error("ADMIN_IP_ALLOWLIST contains an invalid CIDR prefix")
      list.addSubnet(address, count, type)
    }
  }
  return (given: string | null) => {
    if (!rules.length) return true
    const address = given?.startsWith("::ffff:") ? given.slice(7) : given ?? "", family = isIP(address)
    return !!family && list.check(address, family === 4 ? "ipv4" : "ipv6")
  }
}
