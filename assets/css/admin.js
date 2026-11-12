
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CFG = window.SLG_CONFIG || {};
  const U = window.ethers;

  const TX_OPTS = { maxPriorityFeePerGas: 50_000_000n, maxFeePerGas: 100_000_000n };
  const TRIGGER_FEE = 1_000_000_000_000_000n;
  const LOG_KEY = "slg-admin-log";
const PAGE = document.body.dataset.page || "index";

const GATE_HTML =
  '<div class="card gate">' +
  '<div class="gate-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6 11V8a6 6 0 0 1 12 0v3"/><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M12 15v2"/>' +
  "</svg></div>" +
  '<div class="gate-body">' +
  "<h2>连接 owner 钱包以启用写操作</h2>" +
  '<p>只读监控不需要连接钱包。写操作会逐个校验合约 owner，非 owner 调用会回滚 ' +
  '<span class="mono">OwnableUnauthorizedAccount</span>。</p>' +
  '<div class="gate-owners" id="gateOwners"></div>' +
  "</div>" +
  '<button class="btn btn-primary" id="gateConnect" type="button">连接钱包</button>' +
  "</div>";

  const KEYS = {
    pool: { addr: "stakingPool", abi: "stakingPool", label: "StakingPool" },
    node: { addr: "nodeProgram", abi: "nodeProgram", label: "NodeProgram" },
    founding: { addr: "foundingDividend", abi: "nodeDividend", label: "FoundingDividend" },
    cofounder: { addr: "coFounderDividend", abi: "nodeDividend", label: "CoFounderDividend" },
    vault: { addr: "opsVault", abi: "opsVault", label: "OpsVault" },
    hub: { addr: "priceHub", abi: "priceHub", label: "PriceHub", noOwner: true }
  };

  const ADMIN_ABI = {
    stakingPool: [
      "function owner() view returns (address)",
      "function setStakeLimits(uint256 minStakeUSD_, uint256 maxStakeUSD_)",
      "function setRates(uint32 dailyRateBps_, uint16 exitMultiple_, uint16 bniRateBps_)",
      "function dailyRateBpsCeiling() view returns (uint32)",
      "function roundDurationFloor() view returns (uint256)",
      "function setDistribution(uint16 directBps_, uint16 levelPoolBps_, uint16 opsBps_, uint16 foundingBps_, uint16 coFounderBps_)",
      "function setRoundDuration(uint256 roundDuration_)",
      "function setMinExitTriggerBNB(uint256 minExitTriggerBNB_)",
      "function setMaxSlippage(uint16 maxSlippageBps_)",
      "function setSwapTolerance(uint16 toleranceBps_)",
      "function swapToleranceBps() view returns (uint256)",
      "function tokenTaxBps() view returns (uint16)",
      "function setLevelTiers(uint256[7] thresholds, uint16[7] rates)",
      "function pause()",
      "function unpause()",
      "function withdrawReserve(uint256 amount)",
      "function migrateReserveTo(address newPool, uint256 amount)",
      "function rescueToken(address token, address to, uint256 amount)",
      "function renounceOwnership()"
    ],
    nodeProgram: [
      "function owner() view returns (address)",
      "function setPrices(uint256 foundingPrice_, uint256 coFounderPrice_)",
      "function setSalesPaused(bool paused)",
      "function setMaxSlippage(uint16 maxSlippageBps_)",
      "function adminSetNodes(address holder, bool founding, uint256 count)",
      "function adminMoveNodes(address from, address to, bool founding, uint256 count)",
      "function rescueETH(address to, uint256 amount)",
      "function rescueToken(address token, address to, uint256 amount)",
      "function renounceOwnership()",
      "function maxSlippageBps() view returns (uint16)",
      "function totalDonatedSLG() view returns (uint256)"
    ],
    nodeDividend: [
      "function owner() view returns (address)",
      "function setWiring(address registrar_, address stakingPool_)",
      "function adminSetNodes(address holder, uint256 count)",
      "function adminMoveNodes(address from, address to, uint256 count)",
      "function rescueToken(address token, address to, uint256 amount)",
      "function renounceOwnership()",
      "function totalClaimed() view returns (uint256)",
      "function registrar() view returns (address)",
      "function stakingPool() view returns (address)"
    ],
    opsVault: [
      "function owner() view returns (address)",
      "function paused() view returns (bool)",
      "function oskToken() view returns (address)",
      "function allowedToken(address token) view returns (bool)",
      "function memberRegistrar() view returns (address)",
      "function setOskToken(address token)",
      "function setAllowedToken(address token, bool allowed)",
      "function memberCount() view returns (uint256)",
      "function getMembers() view returns (address[])",
      "function getStats() view returns (uint256 accumulated, uint256 members, uint256 remaining, uint256 perShare)",
      "function getTokenStats(address token) view returns (uint256 accumulated, uint256 members, uint256 remaining, uint256 perShare)",
      "function pendingRewards(address member) view returns (uint256)",
      "function totalPendingRewards() view returns (uint256)",
      "function addMember(address member)",
      "function addMembers(address[] members_)",
      "function removeMember(address member)",
      "function removeMembers(address[] members_)",
      "function setMemberRegistrar(address registrar)",
      "function triggerDistribution() payable",
      "function triggerTokenDistribution(address token)",
      "function emergencyWithdraw(address token, uint256 amount, address recipient)",
      "function pause()",
      "function unpause()",
      "function renounceOwnership()"
    ],
    priceHub: [
      "function slgPriceUSD() view returns (uint256)",
      "function bnbPriceUSD() view returns (uint256)",
      "function stableCount() view returns (uint256)",
      "function stableToken(uint256 index) view returns (address)",
      "function stablePair(uint256 index) view returns (address)",
      "function stableUnit(uint256 index) view returns (uint256)",
      "function slgToUSD(uint256 slgAmount) view returns (uint256)",
      "function usdToSLG(uint256 usdAmount) view returns (uint256)"
    ],
    erc20: []
  };

  const state = {
    provider: null,
    signer: null,
    account: null,
    readProvider: null,
    owners: null,
    can: {},
    decimals: { slg: 0, bni: 18 },
    prices: { slg: null, bnb: null, bni: null },
    pool: null,
    node: null,
    div: null,
    vault: null,
    hub: null,
    busy: false,
    refreshing: null,
    log: []
  };

  if (!U) {
    toast("error", "ethers 加载失败", "请检查 assets/js/ethers.umd.min.js。", 12000);
    return;
  }
  document.documentElement.classList.remove("no-js");

  const ZERO = U.ZeroAddress;


  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function num(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function fmtUnits(v, decimals, maxFrac) {
    if (v === null || v === undefined) return "—";
    const d = typeof decimals === "number" ? decimals : 18;
    const frac = typeof maxFrac === "number" ? maxFrac : 4;
    try {
      const raw = U.formatUnits(v, d).split(".");
      const intPart = raw[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const fracPart = (raw[1] || "").slice(0, frac).replace(/0+$/, "");
      return fracPart ? intPart + "." + fracPart : intPart;
    } catch {
      return "—";
    }
  }

  function slgText(v, maxFrac) {
    return fmtUnits(v, state.decimals.slg, typeof maxFrac === "number" ? maxFrac : 2);
  }

  function compact(n) {
    if (n === null || !Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (abs >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (abs >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function usd(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(U.formatUnits(v, 18));
    if (!Number.isFinite(n)) return "—";
    if (n > 0 && n < 0.01) return "$" + n.toPrecision(3);
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function priceText(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(U.formatUnits(v, 18));
    if (!Number.isFinite(n)) return "—";
    if (n >= 1) return "$" + n.toFixed(4);
    if (n >= 0.0001) return "$" + n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    return "$" + n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  }

  function bnbText(v, frac) {
    if (v === null || v === undefined) return "—";
    return fmtUnits(v, 18, typeof frac === "number" ? frac : 5) + " BNB";
  }

  function shortAddr(a) {
    if (!a || /^0x0{40}$/i.test(a)) return "—";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function txHashOf(value) {
    return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value : "";
  }

  function trimUnits(v) {
    if (v === null || v === undefined) return "";
    return U.formatUnits(v, 18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function duration(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return "—";
    if (s < 3600) return Math.round(s / 60) + " 分钟";
    if (s < 86400) return Math.round(s / 3600) + " 小时";
    return Math.round(s / 86400) + " 天";
  }

  function fail(msg) {
    toast("warn", "无法提交", msg);
    return null;
  }

  function readText(id) {
    const el = $(id);
    return el ? el.value.trim().replace(/,/g, "") : "";
  }

  function parseUsd(id, label) {
    const raw = readText(id);
    if (!raw) return fail("请填写" + (label || "数量"));
    try {
      const v = U.parseUnits(raw, 18);
      if (v <= 0n) return fail((label || "数量") + "必须大于 0");
      return v;
    } catch {
      return fail((label || "数量") + "格式不正确");
    }
  }

  function parseBnb(id, label) {
    const raw = readText(id);
    if (!raw) return fail("请填写" + (label || "数量"));
    try {
      const v = U.parseEther(raw);
      if (v <= 0n) return fail((label || "数量") + "必须大于 0");
      return v;
    } catch {
      return fail((label || "数量") + "格式不正确");
    }
  }

  function parseSlg(id, label) {
    const raw = readText(id);
    if (!raw) return fail("请填写" + (label || "数量"));
    try {
      const v = U.parseUnits(raw, state.decimals.slg);
      if (v <= 0n) return fail((label || "数量") + "必须大于 0");
      return v;
    } catch {
      return fail((label || "数量") + "格式不正确");
    }
  }

  function parseBps(id, label, max) {
    const raw = readText(id);
    if (!/^\d+$/.test(raw)) return fail((label || "bps") + "必须是非负整数");
    const v = Number(raw);
    if (max !== undefined && v > max) return fail((label || "bps") + "不能超过 " + max);
    return v;
  }

  function parseCount(id, label) {
    const raw = readText(id);
    if (!/^\d+$/.test(raw)) return fail((label || "数量") + "必须是非负整数");
    return BigInt(raw);
  }

  function parseAddress(id, label, optional) {
    const raw = readText(id);
    if (!raw) return optional ? null : fail("请填写" + (label || "地址"));
    try {
      return U.getAddress(raw);
    } catch {
      return fail((label || "地址") + "格式不正确");
    }
  }

  function toast(type, title, message, ms) {
    const wrap = $("toasts");
    if (!wrap) return;
    while (wrap.children.length >= 4) wrap.removeChild(wrap.firstElementChild);
    const box = document.createElement("div");
    box.className = "toast " + (type || "info");
    const bar = document.createElement("span");
    bar.className = "toast-bar";
    const body = document.createElement("div");
    body.className = "toast-body";
    const t = document.createElement("div");
    t.className = "toast-title";
    t.textContent = title || "";
    body.appendChild(t);
    if (message) {
      const m = document.createElement("div");
      m.className = "toast-msg";
      m.textContent = message;
      body.appendChild(m);
    }
    box.appendChild(bar);
    box.appendChild(body);
    wrap.appendChild(box);
    window.setTimeout(() => {
      box.classList.add("out");
      window.setTimeout(() => box.remove(), 240);
    }, typeof ms === "number" ? ms : 5600);
  }

  const ERRORS = {
    OwnableUnauthorizedAccount: "当前钱包不是该合约的管理员",
    OwnableInvalidOwner: "owner 地址无效",
    InvalidParams: "参数不合法（检查递增关系、总和与上限）",
    AboveMaximum: "数值超出允许范围",
    BelowMinimum: "数值低于允许范围",
    ZeroAmount: "金额不能为 0",
    ZeroAddress: "地址不能为零地址",
    EnforcedPause: "合约已暂停",
    ExpectedPause: "合约未处于暂停状态",
    PriceNotReady: "手动价尚未到生效时间",
    DeviationTooLarge: "价格偏离过大",
    StaleFeed: "预言机数据过期",
    ZeroPrice: "价格尚未设置",
    InsufficientReserve: "储备金不足",
    TransferFailed: "转账失败",
    Unauthorized: "没有操作权限",
    SoldOut: "已售罄",
    SalesPausedError: "销售已暂停",
    BadReferrer: "推荐人不能是自己",
    WrongPrice: "支付金额与单价不一致",
    NoNodes: "尚无节点持有人",
    NothingToClaim: "暂无可领取金额",
    ERC20InsufficientBalance: "SLG 余额不足",
    ERC20InsufficientAllowance: "授权额度不足",
    NoMembers: "金库还没有成员",
    AlreadyMember: "该地址已是成员",
    MemberLimitExceeded: "成员数量已达上限",
    NotMember: "该地址不是成员",
    InvalidTriggerFee: "触发费不正确",
    TokenNotAllowed: "该代币不在白名单",
    OskTokenNotSet: "尚未设置 OSK 代币",
    InsufficientGas: "gas 不足，请提高 gasLimit",
    InsufficientDistributableBalance: "可分配余额不足"
  };

  function explain(err) {
    if (!err) return "未知错误";
    const revert = err.revert || (err.info && err.info.error && err.info.error.data) || null;
    const name = revert && revert.name ? revert.name : null;
    if (name) return ERRORS[name] || name;
    let msg = err.shortMessage || err.message || String(err);
    if (/user rejected|user denied|ACTION_REJECTED/i.test(msg)) return "已取消签名";
    if (/insufficient funds/i.test(msg)) return "钱包 BNB 不足，无法支付 gas";
    if (/nonce/i.test(msg)) return "交易序号冲突，请稍后重试";
    if (/CALL_EXCEPTION/i.test(msg)) return "合约调用失败";
    if (/timeout|network|fetch/i.test(msg)) return "网络请求失败，请检查 RPC";
    return msg.replace(/^execution reverted:?\s*/i, "").slice(0, 160);
  }


  function mergeAbi(base, extra) {
    const seen = new Set();
    return [...(base || []), ...(extra || [])].filter((fragment) => {
      if (seen.has(fragment)) return false;
      seen.add(fragment);
      return true;
    });
  }

  function readContract(key, runner) {
    const meta = KEYS[key];
    const abi = mergeAbi(window.SLG_ABI[meta.abi], ADMIN_ABI[meta.abi]);
    return new U.Contract(CFG.addresses[meta.addr], abi, runner || state.readProvider);
  }

  function writeContract(key) {
    return readContract(key, state.signer);
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runLimited(tasks, limit) {
    const out = new Array(tasks.length).fill(null);
    let cursor = 0;
    const size = Math.max(1, Math.min(limit || 5, tasks.length));
    const workers = new Array(size).fill(0).map(async () => {
      while (cursor < tasks.length) {
        const i = cursor++;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            out[i] = await withTimeout(tasks[i](), 9000);
            break;
          } catch {
            if (attempt === 2) out[i] = null;
            else await sleep(180 * (attempt + 1));
          }
        }
      }
    });
    await Promise.all(workers);
    return out;
  }


  async function ensureChain() {
    if (!window.ethereum) return false;
    const hex = "0x" + Number(CFG.chainId).toString(16);
    try {
      const current = await window.ethereum.request({ method: "eth_chainId" });
      if (String(current).toLowerCase() === hex) return true;
    } catch {
    }
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      return true;
    } catch (e) {
      if (e && (e.code === 4902 || e.code === -32603)) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hex,
                chainName: CFG.chainName,
                nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                rpcUrls: [CFG.walletRpc || CFG.rpcUrls[0]],
                blockExplorerUrls: [CFG.explorer]
              }
            ]
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  async function connect() {
    if (!window.ethereum) {
      toast("warn", "未检测到钱包", "请安装 MetaMask 等 EVM 钱包扩展。", 7000);
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!(await ensureChain())) {
        toast("warn", "网络不正确", "请切换到 BSC 主网（Chain ID 56）。", 7000);
        return;
      }
      state.provider = new U.BrowserProvider(window.ethereum);
      const network = await state.provider.getNetwork();
      if (Number(network.chainId) !== Number(CFG.chainId)) {
        toast("warn", "网络不正确", "当前链 ID " + Number(network.chainId) + "，需要 56。", 7000);
        return;
      }
      state.signer = await state.provider.getSigner();
      state.account = await state.signer.getAddress();
      renderWallet();
      await refreshAll(true);
      toast("success", "钱包已连接", shortAddr(state.account));
    } catch (err) {
      toast("error", "连接失败", explain(err));
    }
  }

  function disconnect() {
    state.provider = null;
    state.signer = null;
    state.account = null;
    state.owners = null;
    state.can = {};
    renderWallet();
    renderAccess();
    toast("info", "已断开", "写操作已锁定。");
  }

  function renderWallet() {
    const text = $("connectBtnText");
    const pill = $("chainPill");
    const chain = $("chainName");
    if (text) text.textContent = state.account ? shortAddr(state.account) : "连接钱包";
    if (pill && chain) {
      pill.classList.toggle("ok", !!state.account);
      chain.textContent = "BSC";
    }
  }


  function buildReadProvider() {
    const entries = CFG.rpcUrls.map((u, i) => ({
      provider: new U.JsonRpcProvider(u, CFG.chainId, { staticNetwork: true }),
      priority: i + 1,
      stallTimeout: 2500,
      weight: 1
    }));
    return new U.FallbackProvider(entries, CFG.chainId, { quorum: 1 });
  }

  async function pickProvider() {
    const provider = buildReadProvider();
    await provider.getBlockNumber().catch(() => {});
    return provider;
  }

  async function loadOwners() {
    const res = await runLimited(
      Object.keys(KEYS).map((k) =>
        KEYS[k].noOwner ? () => Promise.resolve(null) : () => readContract(k).owner()
      ),
      6
    );
    state.owners = {};
    Object.keys(KEYS).forEach((k, i) => {
      state.owners[k] = res[i] || null;
    });
    const me = state.account ? state.account.toLowerCase() : null;
    state.can = {};
    Object.keys(KEYS).forEach((k) => {
      state.can[k] = !!(me && state.owners[k] && state.owners[k].toLowerCase() === me);
    });
  }

  async function loadMonitor() {
    const pool = readContract("pool");
    const node = readContract("node");
    const fd = readContract("founding");
    const cd = readContract("cofounder");
    const vault = readContract("vault");
    const hub = readContract("hub");
    const slg = new U.Contract(CFG.token.slg, window.SLG_ABI.erc20, state.readProvider);

    const r = await runLimited(
      [
        () => pool.isSolvent(),
        () => pool.paused(),
        () => pool.yieldReserveSLG(),
        () => pool.totalPrincipalSLG(),
        () => pool.totalUnpaidUSD(),
        () => pool.stakerCount(),
        () => pool.totalDepositUSD(),
        () => pool.totalRewardUSD(),
        () => pool.totalDistributionUSD(),
        () => pool.dailyRateBps(),
        () => pool.roundDuration(),
        () => pool.minStakeUSD(),
        () => pool.maxStakeUSD(),
        () => pool.exitMultiple(),
        () => pool.bniRateBps(),
        () => pool.minExitTriggerBNB(),
        () => pool.maxSlippageBps(),
        () => pool.directBps(),
        () => pool.levelPoolBps(),
        () => pool.opsBps(),
        () => pool.foundingBps(),
        () => pool.coFounderBps(),
        () => pool.dailyRateBpsCeiling(),
        () => pool.roundDurationFloor(),
        () => pool.swapToleranceBps(),
        () => pool.tokenTaxBps(),

        () => hub.slgPriceUSD(),
        () => hub.bnbPriceUSD(),
        () => hub.stableCount(),

        () => node.foundingSold(),
        () => node.coFounderSold(),
        () => node.foundingPrice(),
        () => node.coFounderPrice(),
        () => node.salesPaused(),
        () => node.maxSlippageBps(),
        () => node.totalDonatedSLG(),

        () => fd.nodeCount(),
        () => fd.capacity(),
        () => fd.totalDistributed(),
        () => slg.balanceOf(CFG.addresses.foundingDividend),
        () => cd.nodeCount(),
        () => cd.capacity(),
        () => cd.totalDistributed(),
        () => slg.balanceOf(CFG.addresses.coFounderDividend),

        () => vault.getStats(),
        () => vault.getTokenStats(CFG.token.slg),
        () => vault.oskToken(),
        () => vault.memberCount(),
        () => vault.totalPendingRewards(),
        () => vault.paused(),

        () => state.readProvider.getBalance(CFG.addresses.opsVault)
      ],
      6
    );

    const [
      solvent, paused, reserve, principal, unpaid, stakers, depositUSD, rewardUSD, distUSD,
      dailyRate, roundDuration, minStake, maxStake, exitMultiple, bniRate, trigger, slippage,
      directBps, levelBps, opsBps, foundingBps, coFounderBps,
      rateCeiling, floor, tolerance, taxBps,
      slgPrice, bnbPrice, stableCount,
      foundingSold, coSold, foundingPrice, coPrice, salesPaused, nodeSlippage, donated,
      fdNodes, fdCap, fdDist, fdBalance,
      cdNodes, cdCap, cdDist, cdBalance,
      vaultStats, vaultTokenStats, vaultOsk, vaultMembers, vaultPending, vaultPaused,
      vaultBalance
    ] = r;

    // SLG.decimals() is 0 on-chain while the pool and PriceHub price
    // 18-decimal units. Use the configured unit instead of decimals().
    const cfgSlg = Number(CFG.token && CFG.token.slgDecimals);
    state.decimals.slg = Number.isFinite(cfgSlg) && cfgSlg >= 0 ? cfgSlg : 0;
    const cfgBni = Number(CFG.token && CFG.token.bniDecimals);
    state.decimals.bni = Number.isFinite(cfgBni) && cfgBni >= 0 ? cfgBni : 18;
    state.prices = { slg: slgPrice || null, bnb: bnbPrice || null, bni: null };
    state.prices.bni = await loadBniPrice(bnbPrice);

    state.pool = {
      solvent: solvent === null ? null : !!solvent,
      paused: !!paused,
      reserve: reserve || 0n,
      principal: principal || 0n,
      unpaid: unpaid || 0n,
      stakers: num(stakers),
      depositUSD: depositUSD || 0n,
      rewardUSD: rewardUSD || 0n,
      distUSD: distUSD || 0n,
      dailyRate: num(dailyRate) || 0,
      ratePeriod: 86400,
      chainMaxDaily: num(rateCeiling) || 10000,
      maxDailyRate: num(rateCeiling) || 10000,
      roundDuration: num(roundDuration) || 0,
      roundFloor: num(floor) || 60,
      minStake, maxStake,
      exitMultiple: num(exitMultiple) || 1,
      bniRate: num(bniRate) || 0,
      trigger: trigger || null,
      slippage: num(slippage),
      tolerance: num(tolerance),
      taxBps: num(taxBps) || 0,
      bps: { direct: num(directBps), level: num(levelBps), ops: num(opsBps), founding: num(foundingBps), coFounder: num(coFounderBps) }
    };

    state.hub = {
      stableCount: num(stableCount) || 0
    };

    state.node = {
      foundingSold: num(foundingSold),
      coSold: num(coSold),
      foundingPrice, coPrice,
      paused: !!salesPaused,
      slippage: num(nodeSlippage),
      donated: donated || 0n
    };

    state.div = {
      founding: { nodes: num(fdNodes) || 0, cap: num(fdCap) || 33, dist: fdDist || 0n, balance: fdBalance || 0n },
      cofounder: { nodes: num(cdNodes) || 0, cap: num(cdCap) || 99, dist: cdDist || 0n, balance: cdBalance || 0n }
    };

    const stats = Array.isArray(vaultStats) ? vaultStats : null;
    const tstats = Array.isArray(vaultTokenStats) ? vaultTokenStats : null;
    state.vault = {
      bnb: vaultBalance !== null ? vaultBalance : (stats && stats[0]) || 0n,
      slg: (tstats && tstats[0]) || 0n,
      members: num(vaultMembers) || (stats ? num(stats[1]) || 0 : 0),
      remaining: (stats && stats[2]) || 0n,
      perShare: (stats && stats[3]) || 0n,
      osk: vaultOsk || null,
      pending: vaultPending || 0n,
      paused: !!vaultPaused
    };

    const lv = await runLimited(
      Array.from({ length: 14 }, (_, i) => () =>
        i < 7 ? pool.levelThresholdUSD(i) : pool.levelRateTierBps(i - 7)
      ),
      4
    );
    state.levels = Array.from({ length: 7 }, (_, i) => ({
      threshold: lv[i],
      rate: num(lv[7 + i])
    }));

    renderMonitor();
    fillForms();
  }

  async function loadBniPrice(bnbPrice) {
    const pk = CFG.pancake;
    if (!pk || !storeRead() || !bnbPrice) return null;
    try {
      let pairAddr = pk.bniPair;
      if (!pairAddr) {
        const factory = new U.Contract(pk.factory, window.SLG_ABI.pancakeFactory, storeRead());
        pairAddr = await factory.getPair(CFG.token.bni, pk.wbnb);
      }
      if (!pairAddr || /^0x0{40}$/i.test(pairAddr)) return null;
      const pair = new U.Contract(pairAddr, window.SLG_ABI.pancakePair, storeRead());
      const [token0, reserves] = await Promise.all([pair.token0(), pair.getReserves()]);
      const is0 = token0.toLowerCase() === CFG.token.bni.toLowerCase();
      const bniRes = U.toBigInt(is0 ? reserves[0] : reserves[1]);
      const bnbRes = U.toBigInt(is0 ? reserves[1] : reserves[0]);
      if (bniRes === 0n || bnbRes === 0n) return null;
      return (bnbPrice * bnbRes) / bniRes;
    } catch {
      return null;
    }
  }

  function storeRead() {
    return state.readProvider;
  }


  function renderMonitor() {
    const p = state.pool;
    const hub = state.hub;
    const node = state.node;
    const div = state.div;
    const vault = state.vault;
    if (!p || !node || !div || !vault) return;

    setText("mSolvent", p.solvent === null ? "—" : p.solvent ? "偿付充足" : "储备不足");
    const solventEl = $("mSolvent");
    if (solventEl) solventEl.style.color = p.solvent ? "var(--mint)" : "var(--rose)";

    setText("mPaused", p.paused ? "已暂停" : "运行中");
    const pausedEl = $("mPaused");
    if (pausedEl) pausedEl.style.color = p.paused ? "var(--rose)" : "var(--mint)";

    setText("mReserve", slgText(p.reserve) + " SLG");
    setText("mPrincipal", slgText(p.principal) + " SLG");
    setText("mUnpaid", usd(p.unpaid));
    const unpaidEl = $("mUnpaid");
    if (unpaidEl) unpaidEl.style.color = p.unpaid > 0n ? "var(--gold)" : "";
    setText("mStakers", p.stakers === null ? "—" : String(p.stakers));
    setText("mDeposit", usd(p.depositUSD));
    setText("mReward", usd(p.rewardUSD));
    setText("mDist", usd(p.distUSD));

    const modeTag = $("mPriceMode");
    if (modeTag) {
      modeTag.textContent = "实时链上报价";
      modeTag.className = "tag live";
    }
    setText("mSlg", priceText(state.prices.slg));
    setText("mBni", priceText(state.prices.bni));
    setText("mBnb", priceText(state.prices.bnb));
    setText("mDelay", "0 秒（实时）");
    setText("mPending", "—");

    const nodeState = $("mNodeState");
    if (nodeState) {
      nodeState.textContent = node.paused ? "销售暂停" : "销售中";
      nodeState.className = "tag " + (node.paused ? "dead" : "live");
    }
    setText("mFoundingSold", (node.foundingSold === null ? "—" : node.foundingSold) + " / 33");
    setText("mCoSold", (node.coSold === null ? "—" : node.coSold) + " / 99");
    setText("mFdBalance", slgText(div.founding.balance) + " SLG");
    setText("mCdBalance", slgText(div.cofounder.balance) + " SLG");
    setText("mVault", bnbText(vault.bnb, 4) + " · " + compact(Number(U.formatUnits(vault.slg, state.decimals.slg))) + " SLG");

    setText("vBnb", bnbText(vault.bnb, 6));
    setText("vSlg", slgText(vault.slg) + " SLG");
    setText("vWallet", shortAddr(vault.osk));
    const walletEl = $("vWallet");
    if (walletEl) walletEl.title = vault.osk || "";

    const oracleHint = $("oracleHint");
    if (oracleHint) {
      oracleHint.textContent =
        "v11 预言机完全链上实时：SLG/BNI 交易对储备价 + 双稳定腿中位数 + Chainlink BNB/USD，无手动模式。";
    }


    const poolStateText = p.paused ? "已暂停" : "运行中";
    setText("hpPoolState", poolStateText);
    const hpPoolEl = $("hpPoolState");
    if (hpPoolEl) hpPoolEl.style.color = p.paused ? "var(--rose)" : "var(--mint)";
    setText(
      "hpDaily",
      (p.dailyRate / 100).toFixed(2) + "% / 天 · 每轮 " + ((p.dailyRate * p.roundDuration) / 86400 / 100).toFixed(2) + "%"
    );
    const capNow = effectiveMaxDaily();
    setText(
      "rateCapHint",
      "链上利率上限 " + capNow.toLocaleString("en-US") + " bps"
    );
    setText("perRoundHint", "按天折算到当前轮次");
    setText(
      "rateDeployHint",
      "v11 按秒线性计息，无单轮上限；利率上限为部署时固定的 dailyRateBpsCeiling。"
    );
    const ratePeriodField = $("ratePeriodField");
    if (ratePeriodField) ratePeriodField.hidden = true;
    const periodBtn = $("btnSetRatePeriod");
    if (periodBtn) periodBtn.hidden = true;
    updateRatePreview();
    setText("paramsPoolState", poolStateText);
    setText("paramsUnpaid", usd(p.unpaid));

    setText("nodeFoundingSold", (node.foundingSold === null ? "—" : node.foundingSold) + " / 33");
    setText("nodeCoSold", (node.coSold === null ? "—" : node.coSold) + " / 99");
    setText(
      "nodeRemaining",
      node.foundingSold === null || node.coSold === null
        ? "—"
        : (33 - node.foundingSold) + " / " + (99 - node.coSold)
    );
    const nodeStateText = $("nodeState");
    if (nodeStateText) {
      nodeStateText.textContent = node.paused ? "销售暂停" : "销售中";
      nodeStateText.style.color = node.paused ? "var(--rose)" : "var(--mint)";
    }
    setText("nodeSlippage", (node.slippage === null ? "—" : node.slippage / 100 + "%"));

    setText("divFdNodes", div.founding.nodes + " / " + div.founding.cap);
    setText("divCdNodes", div.cofounder.nodes + " / " + div.cofounder.cap);
    setText("divFdBalance", slgText(div.founding.balance) + " SLG");
    setText("divCdBalance", slgText(div.cofounder.balance) + " SLG");

    setText("lvPoolLevel", p.bps.level === null || p.bps.level === undefined ? "—" : (p.bps.level / 100).toFixed(0) + "%");
    setText(
      "lvV7",
      state.levels && state.levels[6] && state.levels[6].rate !== null
        ? (state.levels[6].rate / 100).toFixed(0) + "%"
        : "—"
    );
    setText("lvPoolBps", p.bps.level === null || p.bps.level === undefined ? "—" : p.bps.level + " bps");
    setText(
      "lvV7Rate",
      state.levels && state.levels[6] && state.levels[6].rate !== null
        ? state.levels[6].rate + " bps"
        : "—"
    );
    const levelState = $("levelState");
    if (levelState) {
      levelState.textContent = "可编辑";
      levelState.className = "tag live";
    }

    const modeText = "实时链上报价";
    setText("oracleMode", modeText);
    setText("oracleModeValue", modeText);
    setText("oracleDelay", "0 秒（实时）");
    setText("oracleDelayValue", "0 秒（实时）");
    setText("oracleSlg", priceText(state.prices.slg));
    setText("oracleBnb", priceText(state.prices.bnb));
    setText("oracleBni", priceText(state.prices.bni));
    setText("oracleStableCount", state.hub ? String(state.hub.stableCount) : "—");
    const sc2 = $("oracleStableCount2");
    if (sc2) sc2.textContent = state.hub ? String(state.hub.stableCount) : "—";
    setText("oracleOskVault", shortAddr(state.vault && state.vault.osk));
    setText("oracleVaultBnb", bnbText(state.vault && state.vault.bnb, 6));
    setText("oracleVaultSlg", slgText(state.vault && state.vault.slg) + " SLG");
    setText("oracleVaultMembers", state.vault ? String(state.vault.members) : "—");
    setText("oracleVaultPending", state.vault ? bnbText(state.vault.pending, 6) : "—");

    setText("fundsReserve", slgText(p.reserve) + " SLG");
    setText("fundsPrincipal", slgText(p.principal) + " SLG");

    setText("vaultBnb", bnbText(vault.bnb, 6));
    setText("vaultSlg", slgText(vault.slg) + " SLG");
    setText("vaultOsk", shortAddr(vault.osk));
    setText("vaultOskNow", shortAddr(vault.osk));
    ["vaultOsk", "vaultOskNow"].forEach((id) => {
      const el = $(id);
      if (el) el.title = vault.osk || "";
    });
    setText("vaultMembers", String(vault.members));
    setText("vaultPending", bnbText(vault.pending, 6));
    setText("vaultRemaining", String(vault.remaining) + " 人");
    setText("vaultPerShare", bnbText(vault.perShare, 6));
    setText("vaultPausedState", vault.paused ? "已暂停" : "运行中");
    const vp2 = $("vaultPausedState2");
    if (vp2) {
      vp2.textContent = vault.paused ? "已暂停" : "运行中";
      vp2.style.color = vault.paused ? "var(--rose)" : "var(--mint)";
    }
    const vp = $("vaultPausedState");
    if (vp) vp.style.color = vault.paused ? "var(--rose)" : "var(--mint)";
    setText("vaultTolerance", p.tolerance === null ? "—" : p.tolerance + " bps");
    setText("vaultTax", p.taxBps + " bps");
    setText("vaultSwapTolerance", p.tolerance === null ? "—" : p.tolerance + " bps");
    setText("vaultSwapTax", p.taxBps + " bps");

    setText("lookupStakers", p.stakers === null ? "—" : String(p.stakers));

    const monitorState = $("monitorState");
    if (monitorState) {
      monitorState.textContent = "已同步";
      monitorState.className = "tag live";
    }
  }

  function fillForms() {
    const p = state.pool;
    const node = state.node;
    const hub = state.hub;
    if (!p || !node || !hub) return;

    const put = (id, value) => {
      const el = $(id);
      if (el && !el.value) el.value = value;
    };

    put("inMinStake", p.minStake ? U.formatUnits(p.minStake, 18) : "");
    put("inMaxStake", p.maxStake ? U.formatUnits(p.maxStake, 18) : "");
    put("inDailyRate", String(p.dailyRate));
    put("inExitMultiple", String(p.exitMultiple));
    put("inBniRate", String(p.bniRate));
    put("inDirectBps", String(p.bps.direct ?? ""));
    put("inLevelBps", String(p.bps.level ?? ""));
    put("inOpsBps", String(p.bps.ops ?? ""));
    put("inFoundingBps", String(p.bps.founding ?? ""));
    put("inCoFounderBps", String(p.bps.coFounder ?? ""));
    put("inRoundDuration", String(p.roundDuration));
    put("inTriggerBnb", p.trigger ? U.formatUnits(p.trigger, 18) : "");
    put("inSlippage", String(p.slippage ?? ""));
    put("inFoundingPrice", node.foundingPrice ? U.formatUnits(node.foundingPrice, 18) : "");
    put("inCoFounderPrice", node.coPrice ? U.formatUnits(node.coPrice, 18) : "");
    put("inNodeSlippage", String(node.slippage ?? ""));
    put("inTolerance", p.tolerance !== null && p.tolerance !== undefined ? String(p.tolerance) : "");
    put("inTaxBps", String(p.taxBps));

    if (state.levels) {
      state.levels.forEach((lv, i) => {
        if (!lv) return;
        const t = $("lvlT" + i);
        if (t && !t.value && lv.threshold !== null) t.value = trimUnits(lv.threshold);
        const r = $("lvlR" + i);
        if (r && !r.value && lv.rate !== null) r.value = String(lv.rate);
      });
    }

    updateSplitSum();
  }

  function setupReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 }
    );
    items.forEach((el) => io.observe(el));

    window.setTimeout(() => {
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight * 1.5) {
          el.classList.add("in");
        }
      });
    }, 600);
  }

  function ensureGate() {
    const host = $("gateCard");
    if (host && !host.querySelector(".gate")) host.innerHTML = GATE_HTML;
  }

  function isAuthorized(key) {
    if (!state.account || !state.can) return false;
    if (key === "dividend") return !!(state.can.founding || state.can.cofounder);
    return !!state.can[key];
  }

  function renderAccess() {
    ensureGate();
    const gate = $("gateCard");
    const role = $("hpRole");
    const block = document.querySelector("[data-owner]");
    const pageOwner = block ? block.dataset.owner : null;
    const anyOwner = Object.values(state.can || {}).some(Boolean);
    const allowed = pageOwner ? isAuthorized(pageOwner) : anyOwner;

    if (!state.account) {
      if (role) role.textContent = "未连接";
    } else {
      if (role) role.textContent = allowed ? "owner" : "非 owner";
    }
    if (role) role.style.color = allowed ? "var(--mint)" : state.account ? "var(--gold)" : "";

    if (gate) gate.hidden = !!allowed;

    const ownersBox = $("gateOwners");
    if (ownersBox && state.owners) {
      ownersBox.innerHTML = Object.keys(KEYS)
        .map((k) => {
          const addr = state.owners[k];
          return '<span class="owner-chip"><i></i>' + esc(KEYS[k].label) + " " + esc(shortAddr(addr)) + "</span>";
        })
        .join("");
    }
    const gateBtn = $("gateConnect");
    if (gateBtn) gateBtn.onclick = () => (state.account ? disconnect() : connect());

    document.querySelectorAll("[data-owner]").forEach((el) => {
      const key = el.dataset.owner;
      el.hidden = !isAuthorized(key);
    });
  }

  function updateOracleCountdown() {
    return;
  }


  function setBusy(on) {
    state.busy = on;
    document.querySelectorAll("[data-action]").forEach((el) => {
      if (on) el.disabled = true;
    });
    if (!on) document.querySelectorAll("[data-action]").forEach((el) => (el.disabled = false));
  }

  function logAdd(label, hash, ok, message) {
    const entry = {
      time: new Date().toLocaleTimeString(),
      label,
      hash: hash || "",
      ok,
      message: message || ""
    };
    state.log.unshift(entry);
    state.log = state.log.slice(0, 40);
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(state.log));
    } catch {
    }
    renderLog();
  }

  function renderLog() {
    const box = $("txLog");
    if (!box) return;
    if (!state.log.length) {
      box.innerHTML = '<div class="txlog-empty">暂无操作</div>';
      return;
    }
    box.innerHTML = state.log
      .map((e) => {
        const hash = txHashOf(e && e.hash);
        const link = hash
          ? '<a href="' + esc(CFG.explorer) + "/tx/" + hash + '" target="_blank" rel="noopener noreferrer">' +
            esc(hash.slice(0, 10) + "…" + hash.slice(-6)) + "</a>"
          : "";
        return (
          '<div class="txlog-item ' + (e && e.ok ? "ok" : "bad") + '">' +
          '<span class="txlog-time">' + esc(e && e.time) + "</span>" +
          '<span class="txlog-label">' + esc(e && e.label) + "</span>" +
          '<span class="txlog-msg">' +
          esc((e && e.message) || (e && e.ok ? "成功" : "失败")) +
          "</span>" +
          '<span class="txlog-hash">' + link + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  async function send(key, label, factory, gasLimit) {
    if (state.busy) return false;
    setBusy(true);
    let hash = "";
    try {
      let tx;
      try {
        tx = await factory({ ...TX_OPTS, gasLimit: gasLimit || 600000n });
      } catch (firstErr) {
        const m = (firstErr && (firstErr.shortMessage || firstErr.message)) || "";
        if (/max fee per gas|base fee|underpriced/i.test(m)) {
          tx = await factory({
            maxPriorityFeePerGas: 100_000_000n,
            maxFeePerGas: 500_000_000n,
            gasLimit: gasLimit || 600000n
          });
        } else {
          throw firstErr;
        }
      }
      hash = tx.hash;
      toast("info", label + " 已提交", hash.slice(0, 10) + "…" + hash.slice(-6), 6000);
      const rc = await tx.wait();
      if (rc && rc.status === 0) throw new Error("交易被回滚");
      toast("success", label + " 成功", "已确认", 6000);
      logAdd(label, hash, true, "成功");
      await refreshAll(true);
      return true;
    } catch (err) {
      const msg = explain(err);
      toast("error", label + " 失败", msg, 9000);
      logAdd(label, hash, false, msg);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function requireOwner(key) {
    if (!state.can[key]) {
      toast("warn", "权限不足", "当前钱包不是 " + KEYS[key].label + " 的 owner。", 7000);
      return false;
    }
    return true;
  }


  async function actSetStakeLimits() {
    if (!requireOwner("pool")) return;
    const min = parseUsd("inMinStake", "最低入金");
    if (min === null) return;
    const max = parseUsd("inMaxStake", "最高入金");
    if (max === null) return;
    if (max <= min) return fail("最高入金必须大于最低入金");
    const c = writeContract("pool");
    await send("pool", "设置入金范围", (opts) => c.setStakeLimits(min, max, opts), 300000n);
  }

  function effectiveMaxDaily() {
    const p = state.pool;
    return p && p.chainMaxDaily ? p.chainMaxDaily : 10000;
  }

  async function actSetRates() {
    if (!requireOwner("pool")) return;
    const p = state.pool;
    const maxDaily = effectiveMaxDaily();
    const rate = parseBps("inDailyRate", "周期利率", maxDaily);
    if (rate === null) return;
    if (rate === 0) return fail("利率必须大于 0");
    const mult = parseBps("inExitMultiple", "出局倍数", 100);
    if (mult === null) return;
    if (mult < 1) return fail("出局倍数至少为 1");
    const bni = parseBps("inBniRate", "BNI 比例", 1000);
    if (bni === null) return;
    const c = writeContract("pool");
    await send("pool", "设置利率与倍数", (opts) => c.setRates(rate, mult, bni, opts), 300000n);
  }

  async function actSetTolerance() {
    if (!requireOwner("pool")) return;
    const p = state.pool;
    const tax = p ? p.taxBps : 0;
    const v = parseBps("inTolerance", "容差", 4000);
    if (v === null) return;
    if (v < 700) return fail("容差至少 700 bps");
    if (tax && v < tax) return fail("容差不得低于代币税 " + tax + " bps");
    const c = writeContract("pool");
    await send("pool", "设置兑换容差", (opts) => c.setSwapTolerance(v, opts), 300000n);
  }

  async function actSetDistribution() {
    if (!requireOwner("pool")) return;
    const a = parseBps("inDirectBps", "直推", 10000);
    if (a === null) return;
    const b = parseBps("inLevelBps", "等级池", 10000);
    if (b === null) return;
    const c1 = parseBps("inOpsBps", "运营", 10000);
    if (c1 === null) return;
    const d = parseBps("inFoundingBps", "创始", 10000);
    if (d === null) return;
    const e = parseBps("inCoFounderBps", "联创", 10000);
    if (e === null) return;
    if (a + b + c1 + d + e !== 10000) return fail("五项合计必须等于 10000，当前 " + (a + b + c1 + d + e));
    const c = writeContract("pool");
    await send("pool", "设置五桶分配", (opts) => c.setDistribution(a, b, c1, d, e, opts), 300000n);
  }

  async function actSetRoundDuration() {
    if (!requireOwner("pool")) return;
    const raw = readText("inRoundDuration");
    if (!/^\d+$/.test(raw)) return fail("轮次必须是正整数秒数");
    const sec = Number(raw);
    if (sec < 60) return fail("轮次最少 60 秒");
    if (sec > 365 * 86400) return fail("轮次最多 365 天");
    const c = writeContract("pool");
    await send("pool", "设置轮次", (opts) => c.setRoundDuration(sec, opts), 300000n);
  }

  async function actSetTrigger() {
    if (!requireOwner("pool")) return;
    const v = parseBnb("inTriggerBnb", "出局触发额");
    if (v === null) return;
    if (v > U.parseEther("1")) return fail("触发额不能超过 1 BNB");
    const c = writeContract("pool");
    await send("pool", "设置出局触发额", (opts) => c.setMinExitTriggerBNB(v, opts), 300000n);
  }

  async function actSetSlippage() {
    if (!requireOwner("pool")) return;
    const v = parseBps("inSlippage", "滑点", 2000);
    if (v === null) return;
    const c = writeContract("pool");
    await send("pool", "设置滑点", (opts) => c.setMaxSlippage(v, opts), 300000n);
  }

  async function actPause(on) {
    if (!requireOwner("pool")) return;
    const c = writeContract("pool");
    await send("pool", on ? "暂停质押" : "恢复质押", (opts) => (on ? c.pause(opts) : c.unpause(opts)), 300000n);
  }


  function buildLevelForm() {
    const box = $("levelForm");
    if (!box) return;
    let html = '<div class="level-form-head"><span>等级</span><span>门槛（USD）</span><span>比例（bps）</span></div>';
    for (let i = 0; i < 7; i++) {
      html +=
        '<div class="level-form-row">' +
        '<b>V' + (i + 1) + "</b>" +
        '<input id="lvlT' + i + '" type="text" inputmode="decimal" placeholder="0" />' +
        '<input id="lvlR' + i + '" type="text" inputmode="numeric" placeholder="0" />' +
        "</div>";
    }
    box.innerHTML = html;
  }

  function readLevels() {
    const thresholds = [];
    const rates = [];
    for (let i = 0; i < 7; i++) {
      const t = parseUsd("lvlT" + i, "V" + (i + 1) + " 门槛");
      if (t === null) return null;
      const r = parseBps("lvlR" + i, "V" + (i + 1) + " 比例", 10000);
      if (r === null) return null;
      thresholds.push(t);
      rates.push(r);
    }
    for (let i = 1; i < 7; i++) {
      if (thresholds[i] <= thresholds[i - 1]) return fail("V" + (i + 1) + " 门槛必须大于 V" + i);
      if (rates[i] <= rates[i - 1]) return fail("V" + (i + 1) + " 比例必须大于 V" + i);
    }
    const poolLevel = state.pool ? state.pool.bps.level : null;
    if (poolLevel !== null && rates[6] > poolLevel) {
      return fail("V7 比例不能超过等级池 " + poolLevel + " bps");
    }
    return { thresholds, rates };
  }

  async function actSetLevels() {
    if (!requireOwner("pool")) return;
    const data = readLevels();
    if (!data) return;
    const hint = $("levelHint");
    if (hint) hint.textContent = "V1 " + fmtUnits(data.thresholds[0], 18, 0) + " U … V7 " + fmtUnits(data.thresholds[6], 18, 0) + " U";
    const c = writeContract("pool");
    await send("pool", "设置等级配置", (opts) => c.setLevelTiers(data.thresholds, data.rates, opts), 700000n);
  }

  function presetLevels(kind) {
    const prod = [3000, 10000, 30000, 100000, 300000, 1000000, 3000000];
    const test = [3, 10, 30, 10000, 30000, 100000, 300000];
    const rates = [800, 1600, 2400, 3200, 4000, 4800, 6000];
    const list = kind === "test" ? test : prod;
    list.forEach((v, i) => {
      const t = $("lvlT" + i);
      if (t) t.value = String(v);
      const r = $("lvlR" + i);
      if (r) r.value = String(rates[i]);
    });
    const hint = $("levelHint");
    if (hint) hint.textContent = kind === "test" ? "已填入测试阶梯" : "已填入正式阶梯";
  }

  async function lookupUserLevel() {
    const pool = readContract("pool");
    const user = parseAddress("inLevelUser", "用户地址");
    if (!user) return;

    const [effective, team] = await runLimited(
      [() => pool.levelOf(user), () => pool.teamVolumeUSD(user)],
      2
    );
    const effIndex = effective ? num(effective[0]) || 0 : 0;
    const effRate = effective ? num(effective[1]) || 0 : 0;

    let volumeLevel = 0;
    if (team !== null && state.levels && state.levels.length) {
      for (let i = state.levels.length - 1; i >= 0; i--) {
        const th = state.levels[i] && state.levels[i].threshold;
        if (th !== null && th !== undefined && team >= th) { volumeLevel = i + 1; break; }
      }
    }

    setText("lvUserVolume", volumeLevel > 0 ? "V" + volumeLevel : "未定级");
    setText("lvUserEffective", effIndex > 0 ? "V" + effIndex : "未定级");
    setText("lvUserRate", effIndex > 0 ? (effRate / 100).toFixed(0) + "%" : "—");
    setText("lvUserTeam", team === null ? "—" : usd(team));
    setText(
      "levelUserHint",
      effective === null
        ? "读取失败，请检查地址与网络"
        : "v11 等级完全由团队业绩实时计算，链上无保底等级。"
    );
  }



  async function actSetPrices() {
    if (!requireOwner("node")) return;
    const f = parseBnb("inFoundingPrice", "创始节点价格");
    if (f === null) return;
    const c0 = parseBnb("inCoFounderPrice", "联创节点价格");
    if (c0 === null) return;
    const c = writeContract("node");
    await send("node", "设置节点价格", (opts) => c.setPrices(f, c0, opts), 300000n);
  }

  async function actSalesPaused(on) {
    if (!requireOwner("node")) return;
    const c = writeContract("node");
    await send("node", on ? "暂停销售" : "恢复销售", (opts) => c.setSalesPaused(on, opts), 300000n);
  }

  async function actSetNodeSlippage() {
    if (!requireOwner("node")) return;
    const v = parseBps("inNodeSlippage", "滑点", 2000);
    if (v === null) return;
    const c = writeContract("node");
    await send("node", "设置节点滑点", (opts) => c.setMaxSlippage(v, opts), 300000n);
  }

  async function actAdminSetNodes() {
    if (!requireOwner("node")) return;
    const holder = parseAddress("inNodeHolder", "持有人地址");
    if (!holder) return;
    const count = parseCount("inNodeCount", "数量");
    if (count === null) return;
    const founding = ($("inNodeType") ? $("inNodeType").value : "founding") === "founding";
    const c = writeContract("node");
    await send("node", founding ? "设定创始席位" : "设定联创席位", (opts) => c.adminSetNodes(holder, founding, count, opts), 700000n);
  }

  async function actAdminMoveNodes() {
    if (!requireOwner("node")) return;
    const from = parseAddress("inNodeFrom", "原地址");
    if (!from) return;
    const to = parseAddress("inNodeTo", "新地址");
    if (!to) return;
    if (from.toLowerCase() === to.toLowerCase()) return fail("原地址与新地址不能相同");
    const count = parseCount("inNodeMoveCount", "转移数量");
    if (count === null) return;
    if (count === 0n) return fail("转移数量必须大于 0");
    const founding = ($("inNodeType") ? $("inNodeType").value : "founding") === "founding";
    const c = writeContract("node");
    await send("node", "转移席位", (opts) => c.adminMoveNodes(from, to, founding, count, opts), 900000n);
  }


  function dividendKey() {
    const sel = $("inDividendTarget");
    return sel && sel.value === "cofounder" ? "cofounder" : "founding";
  }

  async function actSetWiring() {
    const key = dividendKey();
    if (!requireOwner(key)) return;
    const registrar = parseAddress("inWiringRegistrar", "NodeProgram 地址");
    if (!registrar) return;
    const pool = parseAddress("inWiringPool", "StakingPool 地址");
    if (!pool) return;
    const c = writeContract(key);
    await send(key, "重设 wiring", (opts) => c.setWiring(registrar, pool, opts), 300000n);
  }

  async function actDivSetNodes() {
    const key = dividendKey();
    if (!requireOwner(key)) return;
    const holder = parseAddress("inDivHolder", "持有人地址");
    if (!holder) return;
    const count = parseCount("inDivCount", "数量");
    if (count === null) return;
    const c = writeContract(key);
    await send(key, "修正池内席位", (opts) => c.adminSetNodes(holder, count, opts), 600000n);
  }

  async function actDivMoveNodes() {
    const key = dividendKey();
    if (!requireOwner(key)) return;
    const from = parseAddress("inDivFrom", "原地址");
    if (!from) return;
    const to = parseAddress("inDivTo", "新地址");
    if (!to) return;
    if (from.toLowerCase() === to.toLowerCase()) return fail("原地址与新地址不能相同");
    const count = parseCount("inDivMoveCount", "数量");
    if (count === null) return;
    if (count === 0n) return fail("转移数量必须大于 0");
    const c = writeContract(key);
    await send(key, "池内转移席位", (opts) => c.adminMoveNodes(from, to, count, opts), 800000n);
  }


  async function actTriggerDistribution() {
    if (!requireOwner("vault")) return;
    if (state.vault && state.vault.members === 0) {
      return fail("金库还没有成员，先添加成员再触发分发。");
    }
    if (!window.confirm("确认发送 " + fmtUnits(TRIGGER_FEE, 18, 6) + " BNB 触发金库 BNB 分发？触发额会原额退回。")) return;
    const c = writeContract("vault");
    await send("vault", "触发 BNB 分发", (opts) => c.triggerDistribution({ ...opts, value: TRIGGER_FEE }), 900000n);
  }

  async function actTriggerToken() {
    if (!requireOwner("vault")) return;
    const token = state.vault && state.vault.osk ? state.vault.osk : CFG.token.slg;
    if (!window.confirm("确认触发 SLG 代币分发？无需附带 BNB。")) return;
    const c = writeContract("vault");
    await send("vault", "触发代币分发", (opts) => c.triggerTokenDistribution(token, opts), 900000n);
  }

  async function actEmergencyWithdraw() {
    if (!requireOwner("vault")) return;
    const to = parseAddress("inVaultTo", "收款地址");
    if (!to) return;
    const kind = $("inVaultTokenKind") ? $("inVaultTokenKind").value : "bnb";
    const isBnb = kind === "bnb";
    const token = isBnb ? ZERO : parseAddress("inVaultTokenAddr", "代币地址");
    if (token === null) return;
    const amount = isBnb ? parseBnb("inVaultBnb", "BNB 数量") : parseSlg("inVaultSlg", "SLG 数量");
    if (amount === null) return;
    if (!window.confirm(
      "确认从金库应急提取 " + (isBnb ? fmtUnits(amount, 18, 6) + " BNB" : slgText(amount) + " SLG") +
      " 到 " + to + "？该操作直接转出合约余额，请务必核对地址。"
    )) return;
    const c = writeContract("vault");
    await send("vault", "金库应急提取", (opts) => c.emergencyWithdraw(token, amount, to, opts), 500000n);
  }

  async function actAddMember() {
    if (!requireOwner("vault")) return;
    const member = parseAddress("inVaultMember", "成员地址");
    if (!member) return;
    const c = writeContract("vault");
    await send("vault", "添加成员", (opts) => c.addMember(member, opts), 400000n);
  }

  async function actAddMembers() {
    if (!requireOwner("vault")) return;
    const raw = readText("inVaultMembers");
    if (!raw) return fail("请填写成员地址列表（逗号或换行分隔）");
    const list = raw.split(/[,;\s]+/).filter(Boolean);
    if (!list.length) return fail("未解析到有效地址");
    let members;
    try {
      members = list.map((a) => U.getAddress(a));
    } catch {
      return fail("存在格式不正确的地址");
    }
    if (state.vault && state.vault.members + members.length > 39) {
      return fail("成员总数不能超过 39，当前 " + state.vault.members);
    }
    const c = writeContract("vault");
    await send("vault", "批量添加成员", (opts) => c.addMembers(members, opts), 900000n);
  }

  async function actRemoveMember() {
    if (!requireOwner("vault")) return;
    const member = parseAddress("inVaultMember", "成员地址");
    if (!member) return;
    if (!window.confirm("确认移除成员 " + shortAddr(member) + "？其待发奖励仍可自行 claim。")) return;
    const c = writeContract("vault");
    await send("vault", "移除成员", (opts) => c.removeMember(member, opts), 500000n);
  }

  async function actSetMemberRegistrar() {
    if (!requireOwner("vault")) return;
    const raw = readText("inVaultRegistrar");
    let addr = null;
    if (raw) {
      try {
        addr = U.getAddress(raw);
      } catch {
        return fail("registrar 地址格式不正确");
      }
    }
    const c = writeContract("vault");
    await send("vault", "设置 registrar", (opts) => c.setMemberRegistrar(addr || ZERO, opts), 300000n);
  }

  async function actSetOsk() {
    if (!requireOwner("vault")) return;
    const addr = parseAddress("inVaultOsk", "OSK 代币地址");
    if (!addr) return;
    if (!window.confirm("确认将金库 OSK 代币设为 " + shortAddr(addr) + "？该地址会自动加入白名单。")) return;
    const c = writeContract("vault");
    await send("vault", "设置 OSK 代币", (opts) => c.setOskToken(addr, opts), 300000n);
  }

  async function actSetAllowed() {
    if (!requireOwner("vault")) return;
    const token = parseAddress("inVaultAllowedToken", "代币地址");
    if (!token) return;
    const allowed = !$("inVaultAllowed") || $("inVaultAllowed").value === "true";
    const c = writeContract("vault");
    await send("vault", allowed ? "白名单代币" : "移除白名单", (opts) =>
      c.setAllowedToken(token, allowed, opts), 300000n
    );
  }

  async function actVaultPause(on) {
    if (!requireOwner("vault")) return;
    const c = writeContract("vault");
    await send("vault", on ? "暂停金库" : "恢复金库", (opts) => (on ? c.pause(opts) : c.unpause(opts)), 300000n);
  }


  async function actWithdrawReserve() {
    if (!requireOwner("pool")) return;
    const amount = parseSlg("inReserveAmount", "提取数量");
    if (amount === null) return;
    if (!window.confirm("将提取 " + slgText(amount) + " SLG 的收益储备到 owner 钱包，确认执行？")) return;
    const c = writeContract("pool");
    await send("pool", "提取储备", (opts) => c.withdrawReserve(amount, opts), 500000n);
  }

  async function actMigrate() {
    if (!requireOwner("pool")) return;
    const to = parseAddress("inMigrateTo", "新池地址");
    if (!to) return;
    if (to.toLowerCase() === CFG.addresses.stakingPool.toLowerCase()) return fail("不能迁移到当前池");
    const amount = parseSlg("inMigrateAmount", "迁移数量");
    if (amount === null) return;
    if (!window.confirm("将把 " + slgText(amount) + " SLG 储备转入新池 " + to + "，确认执行？")) return;
    const c = writeContract("pool");
    await send("pool", "迁移储备", (opts) => c.migrateReserveTo(to, amount, opts), 500000n);
  }

  function rescueKey() {
    const sel = $("inRescueTarget");
    return sel ? sel.value : "pool";
  }

  async function actRescueToken() {
    const key = rescueKey();
    if (!requireOwner(key)) return;
    const token = parseAddress("inRescueToken", "代币地址");
    if (!token) return;
    if (token.toLowerCase() === CFG.token.slg.toLowerCase()) return fail("禁止提取 SLG");
    const to = parseAddress("inRescueTo", "收款地址");
    if (!to) return;
    const raw = readText("inRescueAmount");
    if (!/^\d+$/.test(raw) || raw === "0") return fail("数量必须大于 0 的整数（最小单位）");
    const c = writeContract(key);
    await send(key, "提取误转代币", (opts) => c.rescueToken(token, to, BigInt(raw), opts), 400000n);
  }

  async function actRescueEth() {
    if (!requireOwner("node")) return;
    const to = parseAddress("inRescueBnbTo", "收款地址");
    if (!to) return;
    const amount = parseBnb("inRescueBnb", "BNB 数量");
    if (amount === null) return;
    const c = writeContract("node");
    await send("node", "提取误转 BNB", (opts) => c.rescueETH(to, amount, opts), 200000n);
  }

  async function actRenounce() {
    const key = $("inRenounceTarget") ? $("inRenounceTarget").value : "pool";
    if (!requireOwner(key)) return;
    if (readText("inRenounceConfirm") !== "RENOUNCE") {
      return fail("请输入 RENOUNCE 以确认弃权");
    }
    const c = writeContract(key);
    if (!window.confirm("确认放弃 " + KEYS[key].label + " 的 ownership？此操作不可撤销。")) return;
    await send(key, "弃权 " + KEYS[key].label, (opts) => c.renounceOwnership(opts), 300000n);
  }


  async function actLookup() {
    let addr;
    try {
      addr = U.getAddress(readText("inLookup"));
    } catch {
      return fail("地址格式不正确");
    }
    const box = $("lookupResult");
    if (box) box.innerHTML = '<div class="data-row"><span>状态</span><b>查询中…</b></div>';

    try {
      const pool = readContract("pool");
      const node = readContract("node");
      const fd = readContract("founding");
      const cd = readContract("cofounder");

      const r = await runLimited(
        [
          () => pool.orders(addr),
          () => pool.isActiveStaker(addr),
          () => pool.isMature(addr),
          () => pool.canExit(addr),
          () => pool.pendingReward(addr),
          () => pool.levelOf(addr),
          () => pool.teamVolumeUSD(addr),
          () => pool.memberVolumeUSD(addr),
          () => pool.exitCapUSD(addr),
          () => pool.capBaseUSD(addr),
          () => pool.rewardCeilingUSD(addr),
          () => pool.lifetimeEarnedUSD(addr),
          () => pool.unpaidRewardUSD(addr),
          () => pool.referrerOf(addr),
          () => pool.hasStaked(addr),
          () => node.nodesOf(addr),
          () => fd.pending(addr),
          () => cd.pending(addr)
        ],
        6
      );

      const [
        order, active, mature, canExit, pending, level, team, myVol,
        cap, capBase, ceiling, earned, owed, ref, hasStaked, nodes, fdPending, cdPending
      ] = r;

      const rows = [
        ["入金（毛额）", order ? slgText(order.depositSLG, 4) + " SLG" : "—"],
        ["计息本金", order ? slgText(order.principalSLG, 4) + " SLG" : "—"],
        ["入金价值", order ? usd(order.depositUSD) : "—"],
        ["有效订单", active === null ? "—" : active ? "是" : "否"],
        ["本轮到期", mature === null ? "—" : mature ? "是" : "否"],
        ["可达出局线", canExit === null ? "—" : canExit ? "是" : "否"],
        ["本轮待发", pending ? usd(pending[0]) : "—"],
        ["累计已得", earned === null ? "—" : usd(earned)],
        ["收益上限", ceiling === null ? "—" : usd(ceiling)],
        ["出局总额", cap === null ? "—" : usd(cap)],
        ["最大单笔", capBase === null ? "—" : usd(capBase)],
        ["待补发", owed === null ? "—" : usd(owed)],
        ["等级 / 比例", level && Number(level[0]) > 0 ? "V" + Number(level[0]) + " · " + (Number(level[1]) / 100).toFixed(0) + "%" : "未定级"],
        ["团队业绩", team === null ? "—" : usd(team)],
        ["本人最大单", myVol === null ? "—" : usd(myVol)],
        ["推荐人", ref ? shortAddr(ref) : "—"],
        ["曾入金", hasStaked === null ? "—" : hasStaked ? "是" : "否"],
        ["节点（创始/联创）", nodes ? nodes[0].toString() + " / " + nodes[1].toString() : "—"],
        ["节点待领分红", (fdPending || 0n) + (cdPending || 0n) === 0n ? "—" : slgText((fdPending || 0n) + (cdPending || 0n), 4) + " SLG"]
      ];

      if (box) {
        box.innerHTML = rows
          .map(([k, v]) => '<div class="data-row"><span>' + esc(k) + "</span><b>" + esc(v) + "</b></div>")
          .join("");
      }
    } catch (err) {
      if (box) {
        box.innerHTML =
          '<div class="data-row"><span>查询失败</span><b>' + esc(explain(err)) + "</b></div>";
      }
    }
  }


  function updateRatePreview() {
    const out = $("perRoundRate");
    if (!out) return;
    const p = state.pool;
    if (!p) {
      out.value = "—";
      return;
    }
    const rawRate = readText("inDailyRate");
    const rate = /^\d+$/.test(rawRate) ? Number(rawRate) : p.dailyRate;
    const perRound = Math.floor((rate * p.roundDuration) / 86400);
    out.value = perRound.toLocaleString("en-US");
    out.title = "v11 按秒计息：轮次 " + duration(p.roundDuration) + " 内释放 " + (perRound / 100).toFixed(2) + "%";
    out.style.color = "";
  }

  function updateSplitSum() {
    const ids = ["inDirectBps", "inLevelBps", "inOpsBps", "inFoundingBps", "inCoFounderBps"];
    let sum = 0;
    let valid = true;
    ids.forEach((id) => {
      const v = readText(id);
      if (!/^\d+$/.test(v)) valid = false;
      else sum += Number(v);
    });
    const el = $("splitSum");
    if (!el) return;
    el.textContent = "合计 " + sum + " / 10000" + (valid && sum === 10000 ? " · 校验通过" : "");
    el.style.color = valid && sum === 10000 ? "var(--mint)" : sum > 10000 ? "var(--rose)" : "var(--gold)";
  }


  async function actConvert() {
    const raw = readText("inConvertSlg");
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      return fail("请填写大于 0 的整数（1e18 原始单位）");
    }
    const hub = readContract("hub");
    try {
      const [toUsd, toSlg] = await Promise.all([
        hub.slgToUSD(BigInt(raw)),
        hub.usdToSLG(BigInt(raw))
      ]);
      setText("oracleToUsd", toUsd === null ? "—" : usd(toUsd));
      setText("oracleToSlg", toSlg === null ? "—" : U.formatUnits(toSlg, state.decimals.slg));
    } catch (err) {
      setText("oracleToUsd", "—");
      setText("oracleToSlg", "—");
      toast("warn", "换算失败", explain(err));
    }
  }

  async function loadBuybackAdmin() {
    if (PAGE !== "funds" || !state.readProvider) return;
    const pool = readContract("pool");
    const wbnb = new U.Contract(CFG.pancake.wbnb, window.SLG_ABI.erc20, state.readProvider);
    try {
      const [bal, nodeBal, reserve] = await Promise.all([
        wbnb.balanceOf(CFG.addresses.stakingPool),
        wbnb.balanceOf(CFG.addresses.nodeProgram),
        pool.yieldReserveSLG()
      ]);
      let quote = 0n;
      if (bal > 0n && CFG.pancake.router) {
        const router = new U.Contract(CFG.pancake.router, window.SLG_ABI.pancakeRouter, state.readProvider);
        const amounts = await router.getAmountsOut(bal, [CFG.pancake.wbnb, CFG.token.slg]);
        quote = amounts[amounts.length - 1];
      }
      setText("adminBbWbnb", U.formatUnits(bal, 18) + " WBNB");
      setText("adminBbNodeWbnb", U.formatUnits(nodeBal, 18) + " WBNB");
      setText("adminBbQuote", quote > 0n ? slgText(quote) : "—");
      setText("adminBbReserve", slgText(reserve));
      const btn = $("btnBuybackAdmin");
      if (btn) btn.disabled = bal <= 0n;
      const sweep = $("btnSweepNodeWbnb");
      if (sweep) sweep.disabled = nodeBal <= 0n;
    } catch {
      setText("adminBbWbnb", "—");
      setText("adminBbNodeWbnb", "—");
      setText("adminBbQuote", "—");
      setText("adminBbReserve", "—");
    }
  }

  async function actBuyback() {
    if (!requireOwner("pool")) return;
    const c = writeContract("pool");
    await send("pool", "触发回购", (opts) => c.buybackWbnb(0, opts), 600000n);
    await loadBuybackAdmin();
  }

  async function actSweepNodeWbnb() {
    if (!requireOwner("node")) return;
    const wbnb = new U.Contract(CFG.pancake.wbnb, window.SLG_ABI.erc20, state.readProvider);
    let bal = 0n;
    try {
      bal = await wbnb.balanceOf(CFG.addresses.nodeProgram);
    } catch {
      return fail("读取节点合约 WBNB 余额失败");
    }
    if (bal <= 0n) return fail("节点合约内没有 WBNB");
    if (!window.confirm("将节点合约内的 " + U.formatUnits(bal, 18) + " WBNB 转入质押池，确认执行？")) return;
    const c = writeContract("node");
    await send(
      "node",
      "归集 WBNB",
      (opts) => c.rescueToken(CFG.pancake.wbnb, CFG.addresses.stakingPool, bal, opts),
      300000n
    );
    await loadBuybackAdmin();
  }

  async function refreshAll(force) {
    if (state.refreshing) {
      await state.refreshing.catch(() => {});
      if (!force) return;
    }
    state.refreshing = (async () => {
      await loadOwners();
      renderAccess();
      await loadMonitor();
      await loadBuybackAdmin();
    })();
    try {
      await state.refreshing;
    } finally {
      state.refreshing = null;
    }
  }

  function bind() {
    const on = (id, fn, evt) => {
      const el = $(id);
      if (el) el.addEventListener(evt || "click", fn);
    };

    on("connectBtn", () => (state.account ? disconnect() : connect()));
    on("gateConnect", connect);
    on("btnRefresh", async () => {
      const btn = $("btnRefresh");
      if (btn) btn.classList.add("is-loading");
      try {
        await refreshAll(true);
        toast("success", "已刷新", "链上数据已重新读取。", 3000);
      } finally {
        if (btn) btn.classList.remove("is-loading");
      }
    });

    on("btnSetStakeLimits", actSetStakeLimits);
    on("btnSetRates", actSetRates);
    on("btnSetTolerance", actSetTolerance);
    on("btnSetDistribution", actSetDistribution);
    on("btnSetRoundDuration", actSetRoundDuration);
    on("btnSetTrigger", actSetTrigger);
    on("btnSetSlippage", actSetSlippage);
    on("btnPause", () => actPause(true));
    on("btnUnpause", () => actPause(false));

    on("btnSetLevels", actSetLevels);
    on("btnReadUserLevel", () => lookupUserLevel());
    document.querySelectorAll("[data-preset]").forEach((el) => {
      el.addEventListener("click", () => presetLevels(el.dataset.preset));
    });

    on("btnSetPrices", actSetPrices);
    on("btnPauseSales", () => actSalesPaused(true));
    on("btnResumeSales", () => actSalesPaused(false));
    on("btnSetNodeSlippage", actSetNodeSlippage);
    on("btnAdminSetNodes", actAdminSetNodes);
    on("btnAdminMoveNodes", actAdminMoveNodes);

    on("btnSetWiring", actSetWiring);
    on("btnDivSetNodes", actDivSetNodes);
    on("btnDivMoveNodes", actDivMoveNodes);

    on("btnTriggerDistribution", actTriggerDistribution);
    on("btnTriggerToken", actTriggerToken);
    on("btnEmergencyWithdraw", actEmergencyWithdraw);
    on("btnAddMember", actAddMember);
    on("btnAddMembers", actAddMembers);
    on("btnRemoveMember", actRemoveMember);
    on("btnSetMemberRegistrar", actSetMemberRegistrar);
    on("btnSetOsk", actSetOsk);
    on("btnSetAllowed", actSetAllowed);
    on("btnVaultPause", () => actVaultPause(true));
    on("btnVaultUnpause", () => actVaultPause(false));

    on("btnWithdrawReserve", actWithdrawReserve);
    on("btnBuybackAdmin", actBuyback);
    on("btnSweepNodeWbnb", actSweepNodeWbnb);
    on("btnMigrate", actMigrate);
    on("btnRescueToken", actRescueToken);
    on("btnRescueEth", actRescueEth);
    on("btnRenounce", actRenounce);
    on("btnLookup", actLookup);
    on("btnConvert", actConvert);

    on("btnClearLog", () => {
      state.log = [];
      try {
        localStorage.removeItem(LOG_KEY);
      } catch {
      }
      renderLog();
    });

    document.querySelectorAll("[data-quick]").forEach((el) => {
      el.addEventListener("click", () => {
        const kind = el.dataset.quick;
        if (kind === "round") {
          const input = $("inRoundDuration");
          if (input) input.value = el.dataset.value;
        }
        if (kind === "reserve") {
          const input = $("inReserveAmount");
          if (input && state.pool) input.value = U.formatUnits(state.pool.reserve, state.decimals.slg);
        }
      });
    });

    ["inDirectBps", "inLevelBps", "inOpsBps", "inFoundingBps", "inCoFounderBps"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", updateSplitSum);
    });

    ["inDailyRate"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", updateRatePreview);
    });

    if (window.ethereum && typeof window.ethereum.on === "function") {
      window.ethereum.on("accountsChanged", async (accounts) => {
        if (!accounts || !accounts.length) {
          disconnect();
          return;
        }
        try {
          state.signer = await state.provider.getSigner();
          state.account = await state.signer.getAddress();
          renderWallet();
          await refreshAll(true);
          toast("info", "账户已切换", shortAddr(state.account), 5000);
        } catch {
        }
      });
      window.ethereum.on("chainChanged", () => {
        toast("info", "网络已切换", "请确认钱包在 BSC 主网后点击刷新。", 7000);
      });
    }
  }

  async function restore() {
    if (!window.ethereum) return;
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length) {
        state.provider = new U.BrowserProvider(window.ethereum);
        const network = await state.provider.getNetwork();
        if (Number(network.chainId) === Number(CFG.chainId)) {
          state.signer = await state.provider.getSigner();
          state.account = await state.signer.getAddress();
          state.chainId = Number(network.chainId);
          renderWallet();
        }
      }
    } catch {
    }
  }

  async function init() {
    ensureGate();
    bind();
    buildLevelForm();
    setupReveal();
    try {
      state.log = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    } catch {
      state.log = [];
    }
    renderLog();
    renderWallet();
    renderAccess();

    state.readProvider = await pickProvider();
    await restore();
    setText("hpVersion", CFG.version || "—");
    setText("footerVersion", CFG.version || "—");

    await refreshAll(true);

    window.setInterval(updateOracleCountdown, 1000);
  }

  const boot = () =>
    init().catch((err) => {
      console.error(err);
      toast("error", "页面初始化失败", explain(err), 10000);
    });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
