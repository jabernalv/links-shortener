const crypto = require("crypto");

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const ips = String(xff)
      .split(",")
      .map((s) => s.trim());
    return ips[0];
  }
  return req.connection?.remoteAddress || req.socket?.remoteAddress || "";
}

function anonymizeIp(ip) {
  if (!ip) return "";
  // IPv4: remove last octet; IPv6: truncate to approx /64
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      parts[3] = "0";
      return parts.join(".");
    }
    return ip;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + "::";
  }
  return ip;
}

function hashIp(ip, salt = process.env.IP_HASH_SALT || "") {
  if (!ip || !salt) return "";
  return crypto
    .createHash("sha256")
    .update(ip + "|" + salt)
    .digest("hex");
}

function detectBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return /(bot|spider|crawl|slurp|fetch)/.test(ua);
}

module.exports = { getClientIp, anonymizeIp, hashIp, detectBot };
