
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CFG = window.SLG_CONFIG || {};
  const ABI = window.SLG_ABI || {};
  const U = window.ethers;
  const PAGE = document.body.dataset.page || "home";
  const LEVEL_COUNT = 7;

  const store = {
    readProvider: null,
    browserProvider: null,
    signer: null,
    account: null,
    chainId: null,
    decimals: { slg: 0, bni: 18 },
    prices: { slg: null, bnb: null, manual: false },
    node: null,
    pool: null,
    div: null,
    ops: null,
    levels: [],
    order: null,
    user: null,
    accountError: false,
    tick: null,
    busy: false,
    autoAmount: "",
    syncingUsd: false,
    matureKey: null,
    statsFailed: false,
    refreshing: null,
    buyback: { poolWbnb: 0n, nodeWbnb: 0n, total: 0n, reserve: 0n, tolerance: 0, quoted: null, error: null, seq: 0 }
  };

  if (!U) {
    fatal("ethers.js 加载失败", "请检查 assets/js/ethers.umd.min.js 是否存在。");
    return;
  }
  document.documentElement.classList.remove("no-js");

  const ZERO = U.ZeroAddress;
  const MAX_UINT = U.MaxUint256;
  const PRICE_UNIT = 10n ** 18n;


  function fatal(title, msg) {
    const wrap = $("toasts");
    if (!wrap) return;
    const box = document.createElement("div");
    box.className = "toast error";
    box.innerHTML =
      '<span class="toast-bar"></span><div class="toast-body">' +
      '<div class="toast-title"></div><div class="toast-msg"></div></div>';
    box.querySelector(".toast-title").textContent = title;
    box.querySelector(".toast-msg").textContent = msg;
    wrap.appendChild(box);
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
  }

  function num(value) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function fmtUnits(value, decimals, maxFrac) {
    if (value === null || value === undefined) return "—";
    const d = typeof decimals === "number" ? decimals : store.decimals.slg;
    const frac = typeof maxFrac === "number" ? maxFrac : 4;
    try {
      const raw = U.formatUnits(value, d);
      const parts = raw.split(".");
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const fracPart = (parts[1] || "").slice(0, frac).replace(/0+$/, "");
      return fracPart ? intPart + "." + fracPart : intPart;
    } catch {
      return "—";
    }
  }

  function rawUnits(value, decimals) {
    try {
      return U.formatUnits(value, typeof decimals === "number" ? decimals : store.decimals.slg);
    } catch {
      return "";
    }
  }

  function compact(n) {
    if (n === null || !Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e15) return n.toExponential(2).replace("e+", "e");
    if (abs >= 1e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, "") + "T";
    if (abs >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (abs >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (abs >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function usd(value) {
    if (value === null || value === undefined) return "—";
    const n = Number(U.formatUnits(value, 18));
    if (!Number.isFinite(n)) return "—";
    if (n > 0 && n < 0.01) return "$" + n.toPrecision(3);
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function usdNum(n, frac) {
    if (n === null || !Number.isFinite(n)) return "—";
    const digits = typeof frac === "number" ? frac : 2;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function priceText(value) {
    if (value === null || value === undefined) return "—";
    const n = Number(U.formatUnits(value, 18));
    if (!Number.isFinite(n)) return "—";
    if (n >= 1) return "$" + n.toFixed(4);
    if (n >= 0.0001) return "$" + n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    return "$" + n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  }
  function tokenPriceText() {
    const p = store.prices.slg;
    if (p === null || p === undefined) return "—";
    const perUnit = Number(U.formatUnits(p, 18));
    const perToken = (perUnit * Math.pow(10, store.decimals.slg)) / 1e18;
    if (!Number.isFinite(perToken) || perToken <= 0) return "—";
    if (perToken >= 0.0001) {
      return "$" + perToken.toPrecision(6).replace(/0+$/, "").replace(/\.$/, "");
    }
    return "$" + perToken.toExponential(4);
  }

  function slgUsd(amountRaw) {
    if (!store.prices.slg || amountRaw === null || amountRaw === undefined) return null;
    return (amountRaw * store.prices.slg) / PRICE_UNIT;
  }

  async function loadBniPrice() {
    const pk = CFG.pancake;
    if (!pk || !store.readProvider || !store.prices.bnb) return null;
    try {
      let pairAddr = pk.bniPair;
      if (!pairAddr) {
        const factory = new U.Contract(pk.factory, ABI.pancakeFactory, store.readProvider);
        pairAddr = await factory.getPair(CFG.token.bni, pk.wbnb);
      }
      if (!pairAddr || /^0x0{40}$/i.test(pairAddr)) return null;

      const pair = new U.Contract(pairAddr, ABI.pancakePair, store.readProvider);
      const [token0, reserves] = await Promise.all([pair.token0(), pair.getReserves()]);
      const bniIsToken0 = token0.toLowerCase() === CFG.token.bni.toLowerCase();
      const bniReserve = U.toBigInt(bniIsToken0 ? reserves[0] : reserves[1]);
      const bnbReserve = U.toBigInt(bniIsToken0 ? reserves[1] : reserves[0]);

      if (bniReserve === 0n || bnbReserve === 0n) return null;
      return (store.prices.bnb * bnbReserve) / bniReserve;
    } catch {
      return null;
    }
  }

  function bnbText(value, frac) {
    if (value === null || value === undefined) return "—";
    return fmtUnits(value, 18, typeof frac === "number" ? frac : 5) + " BNB";
  }

  function shortAddr(addr) {
    if (!addr || /^0x0{40}$/i.test(addr)) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function maskHash(hash) {
    if (!hash) return "";
    return hash.slice(0, 10) + "…" + hash.slice(-6);
  }

  function durationText(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return "—";
    if (s < 60) return Math.round(s) + " 秒";
    if (s < 3600) return Math.round(s / 60) + " 分钟";
    if (s < 86400) return Math.round(s / 3600) + " 小时";
    return Math.round(s / 86400) + " 天";
  }

  function countdown(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p = (x) => String(x).padStart(2, "0");
    if (d > 0) return `${d} 天 ${p(h)}:${p(m)}`;
    return `${p(h)}:${p(m)}:${p(sec)}`;
  }

  function thresholdText(value) {
    if (value === null || value === undefined) return "—";
    const n = Number(U.formatUnits(value, 18));
    if (n >= 1e8) return compact(n / 1e8) + " 亿";
    if (n >= 1e4) return compact(n / 1e4) + " 万";
    return compact(n);
  }

  function nowSeconds() {
    if (store.tick && store.tick.now) {
      return Math.floor(store.tick.now + (Date.now() - store.tick.at) / 1000);
    }
    return Math.floor(Date.now() / 1000);
  }

  function parseAmount(input) {
    let raw = String(input || "").trim().replace(/,/g, "");
    if (!raw || raw === "." || !/^\d*\.?\d*$/.test(raw)) return null;
    const d = store.decimals.slg;
    if (d === 0 && raw.indexOf(".") >= 0) raw = raw.split(".")[0] || "0";
    try {
      return U.parseUnits(raw, d);
    } catch {
      return null;
    }
  }

  function slgFromUsd(usdWei) {
    // Oracle quotes to ~1e-8 USD/token; the result is rounded UP so the
    // staked value never falls below the entered USD amount.
    const price = store.prices.slg;
    if (!price || price <= 0n) return null;
    return (usdWei * PRICE_UNIT + price - 1n) / price;
  }

  function parseUsdInput(input) {
    const raw = String(input || "").trim().replace(/,/g, "");
    if (!raw || raw === "." || !/^\d*\.?\d*$/.test(raw)) return null;
    try {
      return U.parseUnits(raw, 18);
    } catch {
      return null;
    }
  }

  function slgInputText(slg) {
    const raw = U.formatUnits(slg, store.decimals.slg);
    if (raw.indexOf(".") < 0) return raw;
    const trimmed = raw.replace(/0+$/, "").replace(/\.$/, "");
    return trimmed || "0";
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clampPct(v) {
    return !Number.isFinite(v) ? 0 : Math.max(0, Math.min(100, v));
  }

  function setBar(id, pct) {
    const el = $(id);
    if (el) el.style.width = clampPct(pct).toFixed(2) + "%";
  }

  function truncate(text, head, tail) {
    const s = String(text || "");
    if (s.length <= head + tail + 1) return s;
    return s.slice(0, head) + "…" + s.slice(-tail);
  }

  const ERROR_TEXT = {
    SoldOut: "席位已售罄",
    WrongPrice: "支付金额与当前单价不一致，请刷新后重试",
    SalesPausedError: "节点销售已暂停",
    ZeroAddress: "地址不能为零地址",
    BadReferrer: "推荐人不能是自己",
    TransferFailed: "BNB 转账失败",
    SwapFailed: "兑换失败，请稍后重试",
    InvalidParams: "参数不合法",
    Unauthorized: "没有操作权限",
    ZeroAmount: "数量不能为 0",
    NothingToClaim: "暂无可领取的分红",
    NoNodes: "尚无席位持有人，无法分红",
    ReferrerRequired: "请填写推荐人地址",
    ReferrerNotStaker: "推荐人必须先完成质押",
    ReferralCycle: "推荐关系不能形成闭环",
    BelowMinimum: "入金金额低于最低限制",
    AboveMaximum: "入金金额高于最高限制",
    NotMature: "本轮尚未到期，请等待倒计时结束",
    TriggerTooSmall: "附带 BNB 未达出局门槛",
    ExitNotReady: "尚未达到出局条件",
    MustExit: "收益已达上限，请使用出局按钮（附带 0.001 BNB）",
    ExitAvailable: "收益已达上限，请使用出局按钮（附带 0.001 BNB）",
    InsufficientReserve: "收益储备不足",
    PriceUnavailable: "价格暂不可用，请稍后重试",
    SwapUnavailable: "兑换不可用，请稍后重试",
    SwapFailed: "兑换失败，请稍后重试",
    SlippageExceeded: "兑换滑点超出限制",
    NoOrder: "没有有效订单",
    ERC20InsufficientAllowance: "SLG 授权额度不足，请先授权",
    ERC20InsufficientBalance: "SLG 余额不足",
    OwnableUnauthorizedAccount: "当前钱包不是管理员",
    EnforcedPause: "合约已暂停",
    ExpectedPause: "合约未处于暂停状态",
    PriceNotReady: "手动价尚未到生效时间",
    DeviationTooLarge: "价格偏离过大",
    StaleFeed: "预言机数据过期",
    ZeroPrice: "价格尚未设置"
  };

  function errorText(err) {
    if (!err) return "未知错误";
    const revert = err.revert || (err.info && err.info.error && err.info.error.data) || null;
    const name = revert && revert.name ? revert.name : null;
    if (name) {
      if (name === "RenewalTooSmall") {
        const req = revert.args && revert.args[0];
        return "续押金额不得低于 " + (req ? fmtUnits(req, store.decimals.slg, 4) : "上一单金额") + " SLG";
      }
      return ERROR_TEXT[name] || name;
    }
    let msg = err.shortMessage || err.message || String(err);
    if (/user rejected|user denied|ACTION_REJECTED|denied transaction/i.test(msg)) return "已取消签名";
    if (/network fee|fee unavailable|网络费/i.test(msg)) {
      return "钱包无法估算网络费：通常是 BNB 不足以覆盖「金额 + gas」、钱包 RPC 异常，或交易在模拟时会回滚。请预留 gas 后重试。";
    }
    if (/insufficient funds|INSUFFICIENT_FUNDS/i.test(msg)) {
      return "钱包 BNB 不足以支付「金额 + 网络费」。节点认购需要价格之外再预留约 0.002–0.01 BNB 的 gas。";
    }
    if (/missing revert data/i.test(msg)) {
      return "交易模拟失败：最常见原因是 BNB 不足以覆盖「金额 + gas」，或钱包/RPC 无法执行该交易。请确认余额后重试。";
    }
    if (/could not coalesce/i.test(msg)) {
      return "钱包拒绝了这笔交易（未弹出确认页）。请更新钱包 App、确认已切到 BSC 主网，或在 MetaMask 桌面端重试。";
    }
    if (/CALL_EXCEPTION/i.test(msg)) return "合约调用失败，请稍后重试";
    if (/TRANSFER_FROM_FAILED/i.test(msg)) return "WBNB 授权或余额不足，无法完成兑换";
    if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(msg)) return "滑点超出限制：价格波动过大，请提高滑点后重试";
    if (/EXPIRED/i.test(msg)) return "交易已过期，请重新提交";
    if (/^Error$/i.test(msg.trim())) return "交易模拟失败，请稍后重试或提高滑点";
    if (/timeout|network|fetch/i.test(msg)) return "网络请求失败，请检查 RPC 连接";
    return truncate(msg.replace(/^execution reverted:?\s*/i, ""), 90, 20);
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
    }, typeof ms === "number" ? ms : 5200);
  }


  function buildReadProvider(urls) {
    const list = (urls && urls.length ? urls : CFG.rpcUrls).slice(0, 6);
    const entries = list.map((url, i) => ({
      provider: new U.JsonRpcProvider(url, CFG.chainId, { staticNetwork: true }),
      priority: i + 1,
      stallTimeout: 2000,
      weight: 1
    }));
    return new U.FallbackProvider(entries, CFG.chainId, { quorum: 1 });
  }

  // Booting a FallbackProvider with many children makes the browser open
  // every endpoint and keeps them all polled; on mobile that alone can eat
  // tens of seconds before the first value renders. Probe all candidates in
  // parallel instead, then bind to only the fastest few that answered.
  async function probeRpcUrl(url) {
    const started = performance.now();
    try {
      const res = await Promise.race([
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] })
        }).then((r) => r.json()),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500))
      ]);
      const ms = Math.round(performance.now() - started);
      const ok = !!(res && !res.error && typeof res.result === "string" && /^0x[0-9a-f]+$/.test(res.result));
      return { url, ok, ms };
    } catch {
      return { url, ok: false, ms: 9999 };
    }
  }

  async function pickReadProvider() {
    const urls = (CFG.rpcUrls || []).filter(Boolean);
    let chosen = urls.slice(0, 4);
    try {
      const probed = await Promise.all(urls.map(probeRpcUrl));
      const good = probed.filter((x) => x.ok).sort((a, b) => a.ms - b.ms);
      if (good.length >= 2) {
        chosen = good.slice(0, 4).map((x) => x.url);
      } else if (good.length === 1) {
        chosen = [good[0].url].concat(urls.filter((u) => u !== good[0].url).slice(0, 3));
      }
    } catch {
    }
    const provider = buildReadProvider(chosen);
    await withTimeout(provider.getBlockNumber(), 6000).catch(() => {});
    return provider;
  }

  function readContract(key, abiKey, runner) {
    return new U.Contract(CFG.addresses[key], ABI[abiKey || key], runner || store.readProvider);
  }

  const codeChecked = new Map();

  async function assertChain() {
    if (!window.ethereum) {
      throw new Error(
        isMobileUA()
          ? "未检测到钱包。请在钱包 App 的「DApp 浏览器」中打开本页后再操作。"
          : "未检测到钱包，请先安装并连接钱包"
      );
    }
    let chainId = store.chainId;
    try {
      chainId = Number(await window.ethereum.request({ method: "eth_chainId" }));
    } catch {
    }
    if (chainId === Number(CFG.chainId)) {
      store.chainId = chainId;
      return;
    }
    if (await ensureChain()) {
      store.chainId = Number(CFG.chainId);
      store.browserProvider = new U.BrowserProvider(window.ethereum);
      store.signer = await store.browserProvider.getSigner();
      renderWallet();
      return;
    }
    store.chainId = chainId;
    renderWallet();
    throw new Error(
      "钱包网络不是 BNB Smart Chain（Chain ID 56），请在钱包中切换到 BSC 主网后重试"
    );
  }

  async function assertContract(addr, label) {
    if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      throw new Error((label || "目标") + " 地址无效，请强制刷新页面加载最新 config.js");
    }
    await assertChain();
    if (codeChecked.get(addr) === true) return;
    const provider = store.readProvider || store.browserProvider;
    if (!provider) throw new Error("请先连接钱包");
    let code = null;
    try {
      code = await provider.getCode(addr);
    } catch {
      if (store.browserProvider) code = await store.browserProvider.getCode(addr);
      else throw new Error("网络读取失败，请检查网络后重试");
    }
    if (!code || code === "0x" || code === "0x0") {
      codeChecked.clear();
      throw new Error(
        (label || "目标") + " 地址在当前网络上没有合约代码，请确认钱包已切换到 BSC 主网"
      );
    }
    codeChecked.set(addr, true);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


  const interfaces = new Map();
  function ifaceOf(abiKey) {
    if (!interfaces.has(abiKey)) interfaces.set(abiKey, new U.Interface(ABI[abiKey]));
    return interfaces.get(abiKey);
  }

  function encodeCall(abiKey, fn, args) {
    return ifaceOf(abiKey).encodeFunctionData(fn, args || []);
  }

  async function waitReceipt(hash, timeoutMs) {
    const provider = store.readProvider || store.browserProvider;
    if (!provider) throw new Error("网络读取失败，请刷新后重试");
    const deadline = Date.now() + (timeoutMs || 180000);
    while (Date.now() < deadline) {
      let receipt = null;
      try {
        receipt = await provider.getTransactionReceipt(hash);
      } catch {
      }
      if (receipt) return receipt;
      await sleep(2500);
    }
    return null;
  }

  function checkReceipt(receipt) {
    if (!receipt) throw new Error("交易确认超时，请稍后在区块浏览器确认");
    if (receipt.status === 0) throw new Error("交易被回滚");
  }

  async function walletSend({ to, value, data }) {
    if (!window.ethereum) {
      throw new Error(
        isMobileUA()
          ? "未检测到钱包。请在钱包 App 的「DApp 浏览器」中打开本页后再操作。"
          : "未检测到钱包，请先安装并连接钱包"
      );
    }
    let from = store.account;
    if (!from) {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      from = accounts && accounts[0];
      if (!from) throw new Error("未授权钱包账户");
    }
    const tx = { from, to };
    if (value && value > 0n) tx.value = "0x" + value.toString(16);
    if (data && data !== "0x") tx.data = data;

    let hash;
    try {
      hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [tx] });
    } catch (err) {
      const code = err && err.code;
      const msg = String((err && (err.message || (err.data && err.data.message))) || "");
      if ((code === -32602 || /unsupported|invalid (transaction|param)/i.test(msg)) && !tx.value) {
        hash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from, to, data: tx.data || "0x" }]
        });
      } else {
        throw err;
      }
    }
    return { hash, wait: () => waitReceipt(hash) };
  }


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


  function chainIdOf(raw) {
    if (raw === null || raw === undefined) return null;
    try {
      if (typeof raw === "number") return raw;
      const s = String(raw).trim();
      return Number(s.startsWith("0x") || s.startsWith("0X") ? BigInt(s) : BigInt(s));
    } catch {
      return null;
    }
  }

  async function ensureChain() {
    if (!window.ethereum) return false;
    const hex = "0x" + Number(CFG.chainId).toString(16);
    try {
      const current = await window.ethereum.request({ method: "eth_chainId" });
      if (chainIdOf(current) === Number(CFG.chainId)) return true;
    } catch {
    }
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      return true;
    } catch (switchErr) {
      if (switchErr && (switchErr.code === 4902 || switchErr.code === -32603)) {
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

  function isMobileUA() {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod|HarmonyOS|MiuiBrowser|MicroMessenger|Mobile/i.test(ua)) {
      return true;
    }
    // In-app browsers of mobile wallets may report a desktop-like UA; their
    // injected provider flags are the reliable signal.
    try {
      const w = window.ethereum || {};
      if (
        w.isTokenPocket || w.isTrust || w.isCoinbaseWallet || w.isImToken ||
        w.isMathWallet || w.isOKExWallet || w.isOKXWallet || w.isBitkeep ||
        w.isSafePal || w.isCoin98 || w.isDefiWallet
      ) {
        return true;
      }
    } catch {
    }
    return false;
  }

  async function connectWallet() {
    if (!window.ethereum) {
      toast(
        "warn",
        "未检测到钱包",
        isMobileUA()
          ? "手机浏览器不会注入钱包。请复制本页地址，在 MetaMask / TokenPocket / imToken 等钱包 App 的「DApp 浏览器」中打开后再连接。"
          : "请安装 MetaMask 等 EVM 钱包扩展后刷新页面。",
        12000
      );
      return false;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const chainOk = await ensureChain();
      if (!chainOk) {
        toast("warn", "网络不正确", "请在钱包中切换到 BSC 主网（Chain ID 56）。", 7000);
        return false;
      }
      store.browserProvider = new U.BrowserProvider(window.ethereum);
      await bootstrapAccount(false);
      return true;
    } catch (err) {
      toast("error", "连接失败", errorText(err));
      return false;
    }
  }

  async function bootstrapAccount(silent) {
    if (!store.browserProvider) return;
    const network = await store.browserProvider.getNetwork();
    store.chainId = Number(network.chainId);
    store.signer = await store.browserProvider.getSigner();
    store.account = await store.signer.getAddress();
    store.matureKey = null;

    await loadTokenMeta();
    renderWallet();
    await refreshAll(true);
    if (!silent) toast("success", "钱包已连接", shortAddr(store.account));
  }

  function disconnectWallet() {
    store.account = null;
    store.signer = null;
    store.browserProvider = null;
    store.order = null;
    store.user = null;
    store.accountError = false;
    store.autoAmount = "";
    store.matureKey = null;
    renderWallet();
    renderNodes();
    renderStake();
    renderLevels();
    toast("info", "已断开", "链上数据仍可继续浏览。");
  }

  async function loadTokenMeta() {
    const provider = store.browserProvider || store.readProvider;
    if (!provider) return;

    // SLG.decimals() returns 0 on-chain while the pool / PriceHub price
    // 18-decimal units. Reading decimals() here would scale every amount and
    // price by 1e18, so the configured unit is authoritative.
    const cfgSlg = Number(CFG.token && CFG.token.slgDecimals);
    store.decimals.slg = Number.isFinite(cfgSlg) && cfgSlg >= 0 ? cfgSlg : 0;

    const cfgBni = Number(CFG.token && CFG.token.bniDecimals);
    store.decimals.bni = Number.isFinite(cfgBni) && cfgBni >= 0 ? cfgBni : 18;
    try {
      const bni = new U.Contract(CFG.token.bni, ABI.erc20, provider);
      const bd = await bni.decimals().catch(() => null);
      if (bd !== null && Number.isFinite(Number(bd))) store.decimals.bni = Number(bd);
    } catch {
    }
  }



  async function loadPublic() {
    if (!store.readProvider) return;
    const pool = readContract("stakingPool", "stakingPool");
    const node = readContract("nodeProgram", "nodeProgram");
    const hub = readContract("priceHub", "priceHub");
    const fd = readContract("foundingDividend", "nodeDividend");
    const cd = readContract("coFounderDividend", "nodeDividend");
    const ops = readContract("opsVault", "opsVault");
    const slg = new U.Contract(CFG.token.slg, ABI.erc20, store.readProvider);

    const [r, levelValues] = await Promise.all([
      runLimited(
        [
          () => hub.slgPriceUSD(),
          () => hub.bnbPriceUSD(),

          () => pool.yieldReserveSLG(),
          () => pool.stakerCount(),
          () => pool.totalPrincipalSLG(),
          () => pool.totalDepositUSD(),
          () => pool.totalRewardUSD(),
          () => pool.isSolvent(),
          () => pool.minStakeUSD(),
          () => pool.maxStakeUSD(),
          () => pool.dailyRateBps(),
          () => pool.roundDuration(),
          () => pool.exitMultiple(),
          () => pool.bniRateBps(),
          () => pool.minExitTriggerBNB(),
          () => pool.paused(),

          () => node.foundingPrice(),
          () => node.coFounderPrice(),
          () => node.foundingSold(),
          () => node.coFounderSold(),
          () => node.FOUNDING_SUPPLY(),
          () => node.COFOUNDER_SUPPLY(),
          () => node.salesPaused(),

          () => fd.nodeCount(),
          () => fd.capacity(),
          () => fd.totalDistributed(),
          () => fd.holdersCount(),
          () => slg.balanceOf(CFG.addresses.foundingDividend),

          () => cd.nodeCount(),
          () => cd.capacity(),
          () => cd.totalDistributed(),
          () => cd.holdersCount(),
          () => slg.balanceOf(CFG.addresses.coFounderDividend),

          () => ops.getStats(),
          () => ops.getTokenStats(CFG.token.slg)
        ],
        6
      ),
      runLimited(
        Array.from({ length: LEVEL_COUNT * 2 }, (_, i) => () =>
          i < LEVEL_COUNT ? pool.levelThresholdUSD(i) : pool.levelRateTierBps(i - LEVEL_COUNT)
        ),
        6
      )
    ]);

    const [
      slgPrice, bnbPrice,
      reserve, stakers, principal, depositUSD, rewardUSD, solvent,
      minStake, maxStake, dailyRate, roundDuration, exitMultiple, bniRate, minTrigger, paused,
      foundingPrice, coFounderPrice, foundingSold, coFounderSold,
      foundingSupply, coFounderSupply, salesPaused,
      fdNodes, fdCap, fdDist, fdHolders, fdBalance,
      cdNodes, cdCap, cdDist, cdHolders, cdBalance,
      opsStats, opsTokenStats
    ] = r;

    if (slgPrice === null && bnbPrice === null) {
      if (!store.statsFailed) {
        store.statsFailed = true;
        toast("warn", "链上数据读取失败", "公共 RPC 暂时不可用，可连接钱包后重试。", 7000);
      }
      return;
    }
    store.statsFailed = false;

    store.prices = { slg: slgPrice || null, bnb: bnbPrice || null, bni: null, manual: false };
    store.prices.bni = await loadBniPrice();

    store.pool = {
      reserve: reserve || 0n,
      stakers: num(stakers),
      principal: principal || 0n,
      depositUSD: depositUSD || 0n,
      rewardUSD: rewardUSD || 0n,
      solvent: solvent === null ? null : !!solvent,
      minStake, maxStake,
      dailyRate: num(dailyRate) || 0,
      ratePeriod: 86400,
      roundDuration: num(roundDuration) || 0,
      exitMultiple: num(exitMultiple) || 1,
      bniRate: num(bniRate) || 0,
      minTrigger: minTrigger || null,
      paused: !!paused
    };

    store.node = {
      foundingPrice, coFounderPrice,
      foundingSold: num(foundingSold),
      coFounderSold: num(coFounderSold),
      foundingSupply: num(foundingSupply) || 33,
      coFounderSupply: num(coFounderSupply) || 99,
      salesPaused: !!salesPaused
    };

    store.div = {
      fd: {
        nodes: num(fdNodes) || 0,
        cap: num(fdCap) || 33,
        dist: fdDist || 0n,
        holders: num(fdHolders) || 0,
        balance: fdBalance || 0n
      },
      cd: {
        nodes: num(cdNodes) || 0,
        cap: num(cdCap) || 99,
        dist: cdDist || 0n,
        holders: num(cdHolders) || 0,
        balance: cdBalance || 0n
      }
    };

    const vaultStats = Array.isArray(opsStats) ? opsStats : null;
    const vaultTokenStats = Array.isArray(opsTokenStats) ? opsTokenStats : null;
    store.ops = {
      bnb: (vaultStats && vaultStats[0]) || 0n,
      slg: (vaultTokenStats && vaultTokenStats[0]) || 0n
    };

    const thresholds = levelValues.slice(0, LEVEL_COUNT);
    const rates = levelValues.slice(LEVEL_COUNT);
    store.levels = Array.from({ length: LEVEL_COUNT }, (_, i) => ({
      level: i + 1,
      threshold: thresholds[i],
      rate: num(rates[i]) || 0
    }));

    try {
      const block = await store.readProvider.getBlock("latest");
      store.tick = block && block.timestamp
        ? { now: block.timestamp, at: Date.now() }
        : { now: Math.floor(Date.now() / 1000), at: Date.now() };
    } catch {
      store.tick = { now: Math.floor(Date.now() / 1000), at: Date.now() };
    }

    renderPublic();
    if (PAGE === "stake" || PAGE === "home") loadBuyback().catch(() => {});
  }


  async function readAccountWith(runner, acc) {
    const pool = readContract("stakingPool", "stakingPool", runner);
    const node = readContract("nodeProgram", "nodeProgram", runner);
    const fd = readContract("foundingDividend", "nodeDividend", runner);
    const cd = readContract("coFounderDividend", "nodeDividend", runner);
    const slg = new U.Contract(CFG.token.slg, ABI.erc20, runner);
    const bni = new U.Contract(CFG.token.bni, ABI.erc20, runner);

    return runLimited(
      [
        () => pool.orders(acc),
        () => pool.isMature(acc),
        () => pool.canExit(acc),
        () => pool.pendingReward(acc),
        () => pool.levelOf(acc),
        () => pool.exitCapUSD(acc),
        () => pool.capBaseUSD(acc),
        () => pool.lifetimeEarnedUSD(acc),
        () => pool.rewardCeilingUSD(acc),
        () => pool.teamVolumeUSD(acc),
        () => pool.referrerOf(acc),
        () => pool.hasStaked(acc),
        () => slg.balanceOf(acc),
        () => slg.allowance(acc, CFG.addresses.stakingPool),
        () => bni.balanceOf(acc),
        () => fd.pending(acc),
        () => cd.pending(acc),
        () => node.foundingNodes(acc),
        () => node.coFounderNodes(acc),
        () => runner.getBalance(acc),
        () => pool.unpaidRewardUSD(acc),
        () => pool.isActiveStaker(acc)
      ],
      6
    );
  }

  async function loadAccount() {
    if (!store.account) return;
    // Position state is read-only. Try the probed public RPC first: wallet
    // providers (mobile in-app browsers in particular) often reject or stall
    // eth_call, which used to blank out every position field silently.
    const acc = store.account;
    const readers = [];
    if (store.readProvider) readers.push(store.readProvider);
    if (store.browserProvider && store.browserProvider !== store.readProvider) {
      readers.push(store.browserProvider);
    }
    if (!readers.length) return;

    let r = null;
    for (let i = 0; i < readers.length; i++) {
      r = await readAccountWith(readers[i], acc);
      if (r[0] !== null) break;
    }

    const [
      orderRaw, mature, canExit, pending, levelInfo, exitCap, capBase,
      lifetime, ceiling, teamVolume, referrer, hasStaked,
      slgBalance, allowance, bniBalance,
      foundingPending, coPending, foundingNodes, coNodes, bnbBalance,
      deferredUSD, activeStaker
    ] = r;

    // orders() always returns a 9-field tuple, even for an address that never
    // staked, so null here means every RPC attempt failed. Surface that
    // instead of silently rendering "尚未入金" with empty fields.
    store.accountError = orderRaw === null;

    store.order = orderRaw
      ? {
          depositSLG: orderRaw[0],
          principalSLG: orderRaw[1],
          depositUSD: orderRaw[2],
          principalUSD: orderRaw[3],
          roundStart: num(orderRaw[4]) || 0,
          lastRound: num(orderRaw[5]) || 0,
          earnedUSD: orderRaw[6],
          referrer: orderRaw[7],
          active: !!orderRaw[8]
        }
      : null;

    store.user = {
      mature: !!mature,
      canExit: !!canExit,
      pendingUSD: pending ? pending[0] : 0n,
      pendingSLG: pending ? pending[1] : 0n,
      level: levelInfo ? num(levelInfo[0]) || 0 : 0,
      rateBps: levelInfo ? num(levelInfo[1]) || 0 : 0,
      exitCap: exitCap || 0n,
      capBase: capBase || 0n,
      lifetime: lifetime || 0n,
      ceiling: ceiling || 0n,
      teamVolume: teamVolume || 0n,
      referrer: referrer || ZERO,
      hasStaked: !!hasStaked,
      slgBalance: slgBalance || 0n,
      allowance: allowance || 0n,
      bniBalance: bniBalance || 0n,
      bnbBalance: bnbBalance || 0n,
      foundingPending: foundingPending || 0n,
      coPending: coPending || 0n,
      foundingNodes: num(foundingNodes) || 0,
      coNodes: num(coNodes) || 0,
      deferredUSD: deferredUSD || 0n,
      activeStaker: activeStaker === null ? null : !!activeStaker
    };

    renderAccount();
  }


  function renderWallet() {
    const btnText = $("connectBtnText");
    const btn = $("connectBtn");
    const pill = $("chainPill");
    const chainName = $("chainName");

    if (store.account) {
      if (btnText) btnText.textContent = shortAddr(store.account);
      if (btn) btn.title = "点击断开连接";
      if (pill && chainName) {
        const ok = store.chainId === CFG.chainId;
        pill.classList.toggle("ok", ok);
        pill.classList.toggle("bad", !ok);
        chainName.textContent = ok ? "BSC" : "链 " + store.chainId;
      }
    } else {
      if (btnText) btnText.textContent = "连接钱包";
      if (btn) btn.title = "";
      if (pill && chainName) {
        pill.classList.remove("ok", "bad");
        chainName.textContent = "BSC";
      }
    }
  }

  function renderTicker() {
    setText("tSlgPrice", tokenPriceText());
    setText("tBniPrice", priceText(store.prices.bni));
    setText("tBnbPrice", priceText(store.prices.bnb));
  }

  function renderPublic() {
    renderTicker();
    if (PAGE === "home") renderHome();
    if (PAGE === "nodes") renderNodes();
    if (PAGE === "stake") renderStake();
    if (PAGE === "levels") renderLevels();
  }

  function renderAccount() {
    if (PAGE === "nodes") renderNodes();
    if (PAGE === "stake") renderStake();
    if (PAGE === "levels") renderLevels();
    updateDerived();
  }


  function soldTotal() {
    const n = store.node;
    if (!n || n.foundingSold === null || n.coFounderSold === null) return null;
    return n.foundingSold + n.coFounderSold;
  }

  function renderHome() {
    const node = store.node;
    const pool = store.pool;
    if (!node || !pool) return;

    const sold = soldTotal();
    setText("pNodeSold", sold === null ? "—" : sold + " / " + (node.foundingSupply + node.coFounderSupply));
    setText("pStake", pool.stakers === null ? "—" : String(pool.stakers));
    const top = store.levels.length ? store.levels[store.levels.length - 1].rate : 0;
    setText("pLevelRate", (top / 100).toFixed(0) + "%");
  }


  function renderNodes() {
    const node = store.node;
    if (!node) return;
    const acc = store.account;
    const u = store.user;
    const slgDec = store.decimals.slg;

    const fSold = node.foundingSold;
    const cSold = node.coFounderSold;
    const fCap = node.foundingSupply;
    const cCap = node.coFounderSupply;
    const known = fSold !== null && cSold !== null;
    const fPct = known && fCap ? (fSold / fCap) * 100 : 0;
    const cPct = known && cCap ? (cSold / cCap) * 100 : 0;

    setText("hpSold", known ? fSold + cSold + " / " + (fCap + cCap) : "—");
    setText("hpLeft", known ? String(fCap + cCap - fSold - cSold) : "—");
    const divTotal = store.div ? store.div.fd.dist + store.div.cd.dist : 0n;
    setText("hpDist", fmtUnits(divTotal, slgDec, 0) + " SLG");

    setText("foundingSold", fSold === null ? "—" : String(fSold));
    setText("foundingLeft", fSold === null ? "—" : String(Math.max(0, fCap - fSold)));
    setBar("foundingBar", fPct);
    setText("foundingPrice", bnbText(node.foundingPrice, 6));
    setText("foundingPay", bnbText(node.foundingPrice, 6));

    setText("coFounderSold", cSold === null ? "—" : String(cSold));
    setText("coFounderLeft", cSold === null ? "—" : String(Math.max(0, cCap - cSold)));
    setBar("coFounderBar", cPct);
    setText("coFounderPrice", bnbText(node.coFounderPrice, 6));
    setText("coFounderPay", bnbText(node.coFounderPrice, 6));

    setText("myFounding", acc && u ? String(u.foundingNodes) : "—");
    setText("myCoFounder", acc && u ? String(u.coNodes) : "—");
    setText("foundingPending", acc && u ? fmtUnits(u.foundingPending, slgDec, 4) + " SLG" : "—");
    setText("coFounderPending", acc && u ? fmtUnits(u.coPending, slgDec, 4) + " SLG" : "—");

    const fBtn = $("btnClaimFounding");
    if (fBtn) fBtn.disabled = store.busy || !acc || !u || u.foundingPending === 0n;
    const cBtn = $("btnClaimCoFounder");
    if (cBtn) cBtn.disabled = store.busy || !acc || !u || u.coPending === 0n;

    const fBuy = $("btnBuyFounding");
    if (fBuy) fBuy.disabled = store.busy || node.salesPaused || (fSold !== null && fSold >= fCap);
    const cBuy = $("btnBuyCoFounder");
    if (cBuy) cBuy.disabled = store.busy || node.salesPaused || (cSold !== null && cSold >= cCap);

    if (store.div) {
      const fd = store.div.fd;
      const cd = store.div.cd;
      setText("fdNodes", fd.nodes + " / " + fd.cap);
      setText("fdCap", String(fd.cap));
      setText("fdDist", fmtUnits(fd.dist, slgDec, 2) + " SLG");
      setText("fdHolders", String(fd.holders));
      setText("fdBalance", fmtUnits(fd.balance, slgDec, 2) + " SLG");
      setText("cdNodes", cd.nodes + " / " + cd.cap);
      setText("cdCap", String(cd.cap));
      setText("cdDist", fmtUnits(cd.dist, slgDec, 2) + " SLG");
      setText("cdHolders", String(cd.holders));
      setText("cdBalance", fmtUnits(cd.balance, slgDec, 2) + " SLG");

      const fdState = $("fdState");
      if (fdState) {
        const full = fd.nodes >= fd.cap;
        fdState.textContent = full ? "已售罄" : "开放中";
        fdState.className = "tag " + (full ? "dead" : "live");
      }
      const cdState = $("cdState");
      if (cdState) {
        const full = cd.nodes >= cd.cap;
        cdState.textContent = full ? "已售罄" : "开放中";
        cdState.className = "tag " + (full ? "dead" : "live");
      }
    }
  }


  function exitTriggerBNB() {
    const pool = store.pool;
    if (!pool || !pool.minTrigger) return null;
    return pool.minTrigger;
  }

  function bnbUsd(amountWei) {
    if (!store.prices.bnb || amountWei === null || amountWei === undefined) return null;
    return (amountWei * store.prices.bnb) / 10n ** 18n;
  }

  function renderStake() {
    if (store.pool) {
      setText("hpRound", durationText(store.pool.roundDuration));
      const pp = store.pool;
      const perRound = (pp.dailyRate * pp.roundDuration) / 86400;
      setText("hpDaily", (perRound / 100).toFixed(2) + "%");
      // exitMultiple is the gross cap (deposit * multiple); the 1% BNI cut
      // means the actual payout is multiple - 1% of deposit (e.g. 2.99x).
      const actualExit = pp.exitMultiple - pp.bniRate / 10000;
      setText("hpExit", actualExit.toFixed(2) + "×");
    }

    const order = store.order;
    const u = store.user;
    const acc = store.account;
    const slgDec = store.decimals.slg;

    const active = !!(order && order.active);
    const mature = !!(u && u.mature);
    const canExit = !!(u && u.canExit);
    const readFailed = !!(acc && store.accountError);

    let title = "读取订单中…";
    let tag = "—";
    let tagCls = "";
    let dot = "";

    if (!acc) {
      title = "未连接钱包";
      tag = "只读";
    } else if (readFailed) {
      title = "链上读取失败";
      tag = "重试";
      tagCls = "warn";
    } else if (!active) {
      title = "尚未入金";
      tag = "未激活";
    } else if (canExit) {
      title = "已达出局线";
      tag = "可出局";
      tagCls = "warn";
      dot = "exit";
    } else if (!mature) {
      title = "计息中";
      tag = "锁仓";
      tagCls = "live";
      dot = "active";
    } else {
      title = "本轮已到期";
      tag = "可续押";
      tagCls = "warn";
      dot = "mature";
    }

    const dotEl = $("stateDot");
    if (dotEl) dotEl.className = "state-dot" + (dot ? " " + dot : "");
    setText("stakeStateText", title);
    const tagEl = $("stakeStateTag");
    if (tagEl) {
      tagEl.textContent = tag;
      tagEl.className = "tag " + tagCls;
    }
    const round = $("roundBlock");
    if (round) round.hidden = !(active && acc);

    const stakeReady =
      !acc ||
      (!readFailed && (!active || mature) && !(store.pool && store.pool.paused) && !canExit);
    const btnStake = $("btnStake");
    if (btnStake) {
      btnStake.textContent = "质押（SLG）";
      btnStake.disabled = store.busy || !stakeReady;
    }

    const exitReady = !!acc && active && canExit;
    const btnExit = $("btnExit");
    if (btnExit) {
      const min = exitTriggerBNB();
      const amt = min ? fmtUnits(min, 18, 6) : "0.001";
      btnExit.textContent = "出局（" + amt + " BNB）";
      btnExit.disabled = store.busy || !exitReady;
      btnExit.title = "出局会附带 " + amt + " BNB，合约在同一笔交易原额退回";
    }
    const refRow = $("referrerRow");
    const refInput = $("referrerInput");
    const boundRef = u && u.referrer && !/^0x0{40}$/i.test(u.referrer) ? u.referrer : "";
    const refLocked = !!(u && u.hasStaked);
    if (refRow) refRow.hidden = false;
    if (refInput) {
      if (refLocked) {
        refInput.value = boundRef;
        refInput.placeholder = boundRef ? "" : "无上级地址";
        refInput.disabled = true;
      } else {
        refInput.disabled = !acc;
        refInput.placeholder = acc ? "0x… 上级地址" : "连接钱包后填写";
      }
    }
    setText(
      "referrerRequired",
      refLocked
        ? boundRef ? "已绑定 · 不可修改" : "已质押 · 不可补绑"
        : !acc
        ? "连接后填写"
        : store.pool && store.pool.stakers === 0
        ? "首位质押人可留空"
        : "首单必填"
    );
    setText(
      "referrerHint",
      refLocked
        ? boundRef
          ? "推荐关系已写入链上，之后无法更改。"
          : "该订单开立时未绑定上级，链上不允许补绑。"
        : "仅首次质押可绑定，需填写已完成质押的上级地址。"
    );

    updateDerived();

    setText("odDeposit", active ? fmtUnits(order.depositSLG, slgDec, 4) + " SLG" : "—");
    setText("odPrincipal", active ? fmtUnits(order.principalSLG, slgDec, 4) + " SLG" : "—");
    setText("odDepositUsd", active ? usd(order.depositUSD) : "—");
    setText("odPrincipalUsd", active ? usd(order.principalUSD) : "—");
    setText("odPending", active && u ? fmtUnits(u.pendingSLG, slgDec, 4) + " SLG" : "—");
    setText("odEarned", u ? usd(u.lifetime) : "—");

    const ceiling = u ? u.ceiling : 0n;
    const earned = u ? u.lifetime : 0n;
    const capPct = ceiling > 0n ? (Number(earned) / Number(ceiling)) * 100 : 0;
    setBar("capBar", capPct);
    setText("odCapText", ceiling > 0n ? capPct.toFixed(1) + "%" : "—");
    setText("odCap", ceiling > 0n ? usd(ceiling) : "—");
    setText(
      "odExitTotal",
      active && u ? usd(order.principalUSD + ceiling) : "—"
    );
    setText("odCapBase", u && u.capBase > 0n ? usd(u.capBase) : "—");

    const deferred = u ? u.deferredUSD : 0n;
    const deferRow = $("deferRow");
    if (deferRow) deferRow.hidden = !(acc && deferred > 0n);
    setText("odDeferred", deferred > 0n ? usd(deferred) : "—");
    const deferBtn = $("btnClaimDeferred");
    if (deferBtn) deferBtn.disabled = store.busy || !acc || deferred === 0n;

    setText("odLevel", u && u.level > 0 ? "V" + u.level + " · " + (u.rateBps / 100).toFixed(0) + "%" : "未定级");
    setText("odTeam", u ? usd(u.teamVolume) : "—");
    const refOk = !!(u && u.referrer && !/^0x0{40}$/i.test(u.referrer));
    setText("odRef", refOk ? shortAddr(u.referrer) : "—");
    const refEl = $("odRef");
    if (refEl) refEl.title = refOk ? u.referrer : "";

    setText("odBalance", acc && u ? fmtUnits(u.slgBalance, slgDec, 4) + " SLG" : "—");
    setText("odBnb", acc && u ? fmtUnits(u.bnbBalance, 18, 4) + " BNB" : "—");
    setText("odBni", acc && u ? fmtUnits(u.bniBalance, store.decimals.bni, 2) + " BNI" : "—");

    const amountInput = $("amountInput");
    if (amountInput && active && mature && !canExit) {
      const current = amountInput.value.trim();
      if (!current || current === store.autoAmount) {
        const val = rawUnits(order.depositSLG, slgDec);
        amountInput.value = val;
        store.autoAmount = val;
        const usdEl = $("usdInput");
        if (usdEl) {
          usdEl.value = "";
          setText("usdHint", "输入美元金额，自动换算 SLG（代币精度 " + store.decimals.slg + "）");
        }
      }
    }

    renderRound();
  }
  function renderRound() {
    const order = store.order;
    if (!order || !order.active || !store.pool) return;
    const dur = store.pool.roundDuration || 1;
    const now = nowSeconds();
    const elapsed = Math.max(0, now - order.roundStart);
    setBar("roundBar", (Math.min(elapsed, dur) / dur) * 100);
    const left = order.roundStart + dur - now;
    setText("roundText", left > 0 ? "剩余 " + countdown(left) : "已到期");
    const d = new Date(order.roundStart * 1000);
    const p = (x) => String(x).padStart(2, "0");
    setText(
      "roundStartText",
      "开始 " + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes())
    );
    setText("roundPending", "本轮待发 " + usd(store.user ? store.user.pendingUSD : 0n));
  }

  // Round a raw SLG amount up to the 6th decimal place of the *display* unit.
  // SLG has 0 decimals, so this rounds to a whole token; the oracle quote is
  // far coarser than 18 decimals, so trailing digits below the display
  // precision are fake precision that only confuses the number.
  function roundUpToDisplayQuantum(slg) {
    const dec = store.decimals.slg;
    const places = Math.max(0, dec - 6);
    const step = 10n ** BigInt(places);
    return ((slg + step - 1n) / step) * step;
  }

  function applyUsdShortcut() {
    const usdEl = $("usdInput");
    const amountInput = $("amountInput");
    if (!usdEl || !amountInput) return;

    const usdWei = parseUsdInput(usdEl.value);
    if (usdWei === null) {
      setText("usdHint", "输入美元金额，自动换算 SLG（代币精度 " + store.decimals.slg + "）");
      return;
    }

    const slg = slgFromUsd(usdWei);
    if (slg === null) {
      setText("usdHint", "SLG 价格未读取到，暂无法换算");
      return;
    }

    const clean = roundUpToDisplayQuantum(slg);
    store.syncingUsd = true;
    amountInput.value = slgInputText(clean);
    store.syncingUsd = false;
    store.autoAmount = "";
    setText("usdHint", "≈ " + fmtUnits(slg, store.decimals.slg, 2) + " SLG（按实时价换算）");
    updateDerived();
  }

  function updateDerived() {
    const p = store.prices;
    const pool = store.pool;

    const amount = parseAmount($("amountInput") ? $("amountInput").value : "");
    setText(
      "amountUsd",
      amount !== null && p.slg ? "≈ " + usd(slgUsd(amount)) : "—"
    );

    const rateHint = $("usdRateHint");
    if (rateHint) rateHint.textContent = p.slg ? "1 SLG ≈ " + tokenPriceText() : "价格读取中…";

    if (p.slg && pool && pool.minStake && pool.maxStake) {
      const minSlg = (pool.minStake * PRICE_UNIT) / p.slg;
      const maxSlg = (pool.maxStake * PRICE_UNIT) / p.slg;
      setText(
        "stakeHint",
        "入金区间 " + usd(pool.minStake) + " – " + usd(pool.maxStake) +
          " · 约 " + compact(Number(U.formatUnits(minSlg, store.decimals.slg))) +
          " – " + compact(Number(U.formatUnits(maxSlg, store.decimals.slg))) + " SLG"
      );
    }
  }


  function renderLevels() {
    const table = $("levelTable");
    if (!table || !store.levels.length) return;
    const u = store.user;
    const current = u ? u.level : 0;
    const team = u ? u.teamVolume : 0n;

    let html =
      '<div class="level-row level-head" role="row">' +
      "<span>等级</span><span>团队业绩</span><span>利息占比</span><span>状态</span></div>";

    store.levels.forEach((lv) => {
      const isCurrent = current === lv.level;
      const reached = current > 0 && current >= lv.level;
      html +=
        '<div class="level-row' + (isCurrent ? " is-current" : "") + '" role="row">' +
        '<span class="lv">V' + esc(lv.level) + "</span>" +
        '<span class="need">' + esc(lv.threshold !== null ? thresholdText(lv.threshold) + " U" : "—") + "</span>" +
        '<span class="rate">' + esc((lv.rate / 100).toFixed(0)) + "%</span>" +
        '<span class="current">' + (isCurrent ? "当前" : reached ? "已达成" : "") + "</span>" +
        "</div>";
    });
    table.innerHTML = html;

    const tag = $("myLevelTag");
    if (tag) {
      tag.textContent = current > 0 ? "当前 V" + current : "未定级";
      tag.className = "tag " + (current > 0 ? "live" : "");
    }

    setText("hpLevel", current > 0 ? "V" + current : "未定级");
    setText("hpTeam", u ? usd(team) : "—");
    const top = store.levels[store.levels.length - 1].rate;
    setText("hpMax", (top / 100).toFixed(0) + "%");

    setText("lvTeam", u ? usd(team) : "—");
    setText("lvRate", current > 0 ? (u.rateBps / 100).toFixed(0) + "%" : "—");

    const next = store.levels.find((lv) => lv.level === current + 1);
    if (next && next.threshold) {
      const need = next.threshold > team ? Number(U.formatUnits(next.threshold - team, 18)) : 0;
      setText("lvNextText", need > 0 ? "还需 " + usdNum(need, 2) : "已达标 V" + next.level);
      setBar("lvNextBar", (Number(U.formatUnits(team, 18)) / Number(U.formatUnits(next.threshold, 18))) * 100);
    } else {
      setText("lvNextText", u && current >= LEVEL_COUNT ? "已达最高等级" : "—");
      setBar("lvNextBar", u && current >= LEVEL_COUNT ? 100 : 0);
    }
  }


  function setActionsEnabled(ids, enabled) {
    ids.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = !enabled;
    });
  }

  function setBusy(on) {
    store.busy = on;
    document
      .querySelectorAll(
        "#btnStake, #btnExit, #btnBuyFounding, #btnBuyCoFounder, #btnClaimFounding, #btnClaimCoFounder, #btnClaimDeferred, #btnBuyback"
      )
      .forEach((btn) => {
        if (on) btn.disabled = true;
      });
    if (!on) {
      if (store.node) renderNodes();
      else setActionsEnabled(["btnBuyFounding", "btnBuyCoFounder"], true);
      if (store.pool) renderStake();
      else setActionsEnabled(["btnStake", "btnExit"], true);
    }
  }

  async function refreshAll(force) {
    if (store.refreshing) {
      await store.refreshing.catch(() => {});
      if (!force) return;
    }
    store.refreshing = (async () => {
      await loadPublic();
      // Public endpoints rate-limit; when the first pass leaves the page
      // empty, re-probe for a different fast node and try again so values
      // do not stay stuck at "—".
      for (let attempt = 0; attempt < 2 && (!store.pool || !store.prices.slg); attempt++) {
        await new Promise((r) => setTimeout(r, 1200 + attempt * 800));
        try {
          store.readProvider = await pickReadProvider();
        } catch {
        }
        await loadPublic();
      }
      if (store.account) await loadAccount();
    })();
    try {
      await store.refreshing;
    } finally {
      store.refreshing = null;
    }
  }

  async function ensureWallet() {
    if (store.account && store.signer) return true;
    return connectWallet();
  }

  // Mobile wallets (TokenPocket / MetaMask app browsers) often refuse
  // eth_estimateGas with an explicit `from`, and their eth_call simulation
  // runs against a different RPC than the wallet's own node, so local
  // pre-checks produce false negatives that block the user from ever
  // sending the transaction. On mobile we skip all local gating and let
  // the wallet itself decide; it reports its own error if the tx fails.
  function skipLocalChecks() {
    return isMobileUA() || /[?&]nopreflight=1/.test(location.search);
  }

  async function estimateNetworkFee(tx) {
    if (skipLocalChecks()) return null;
    const provider = store.readProvider || store.browserProvider;
    if (!provider || !store.account) return null;
    try {
      const [gas, fee] = await Promise.all([
        provider.estimateGas({ ...tx, from: store.account }),
        provider.getFeeData()
      ]);
      const gasPrice = fee.maxFeePerGas || fee.gasPrice || 0n;
      if (!gasPrice) return null;
      // Wallets often use a higher effective gas price than the public RPC
      // reports; floor at 1 gwei so the pre-check covers that case.
      const effective = gasPrice > 1_000_000_000n ? gasPrice : 1_000_000_000n;
      return gas * effective;
    } catch {
      return null;
    }
  }

  async function preflight(label, fn) {
    if (skipLocalChecks()) return true;
    try {
      await fn();
      return true;
    } catch (err) {
      const msg = String((err && (err.shortMessage || err.message)) || "");
      if (/insufficient funds|INSUFFICIENT_FUNDS/i.test(msg)) {
        toast(
          "error",
          label + "预检失败",
          "钱包 BNB 不足以同时支付「金额 + 网络费」，请预留约 0.002–0.01 BNB 的 gas。",
          10000
        );
        return false;
      }
      const isRevert = !!(err && (err.revert || err.data || /revert|CALL_EXCEPTION|execution reverted/i.test(msg)));
      if (!isRevert) return true;
      toast("error", label + "预检失败", errorText(err), 10000);
      return false;
    }
  }

  function bnbBalanceText(value) {
    return fmtUnits(value, 18, 6) + " BNB";
  }

  async function approveIfNeeded(amount) {
    const slg = new U.Contract(CFG.token.slg, ABI.erc20, store.readProvider || store.signer);
    let allowance = 0n;
    try {
      allowance = await slg.allowance(store.account, CFG.addresses.stakingPool);
    } catch {
      allowance = 0n;
    }
    if (allowance >= amount) return;
    toast("info", "需要授权 SLG", "请在钱包中确认授权，随后继续提交交易。", 6000);
    const tx = await walletSend({
      to: CFG.token.slg,
      data: encodeCall("erc20", "approve", [CFG.addresses.stakingPool, MAX_UINT])
    });
    toast("info", "授权已提交", maskHash(tx.hash), 6000);
    checkReceipt(await tx.wait());
    toast("success", "授权成功", "继续提交交易。", 4000);
  }

  async function doStake() {
    if (store.busy) return;
    if (!(await ensureWallet())) return;
    if (!store.order) await loadAccount();
    if (!store.pool) await loadPublic();
    if (store.user) await loadAccount();
    if (store.account && store.user) {
      const slgToken = new U.Contract(CFG.token.slg, ABI.erc20, store.browserProvider || store.readProvider);
      try {
        store.user.slgBalance = await slgToken.balanceOf(store.account);
      } catch {
      }
    }

    if (store.user && store.user.canExit) {
      toast("warn", "已达出局线", "请使用出局按钮；此刻续押会被合约拒绝。");
      return;
    }

    const amount = parseAmount($("amountInput") ? $("amountInput").value : "");
    if (amount === null || amount <= 0n) {
      toast("warn", "请输入数量", "填写大于 0 的 SLG 数量。");
      return;
    }

    const order = store.order;
    const mature = store.user && store.user.mature;
    if (order && order.active) {
      if (!mature) {
        const dur = store.pool ? store.pool.roundDuration : 0;
        toast("warn", "本轮尚未到期", "剩余 " + countdown(order.roundStart + dur - nowSeconds()));
        return;
      }
      if (amount < order.depositSLG) {
        toast("warn", "续押金额不足", "不得低于 " + fmtUnits(order.depositSLG, store.decimals.slg, 4) + " SLG。");
        return;
      }
    }

    if (!skipLocalChecks() && store.user && store.user.slgBalance < amount) {
      toast(
        "warn",
        "SLG 余额不足",
        "钱包持有 " + fmtUnits(store.user.slgBalance, store.decimals.slg, 4) + " SLG，本次需要 " +
          fmtUnits(amount, store.decimals.slg, 4) + " SLG。",
        9000
      );
      return;
    }

    let ref = ZERO;
    const rawRef = $("referrerInput") ? $("referrerInput").value.trim() : "";
    const needRef = !!(store.user && !store.user.hasStaked && store.pool && store.pool.stakers > 0);
    if (rawRef) {
      try {
        ref = U.getAddress(rawRef);
      } catch {
        toast("warn", "地址格式无效", "请检查推荐人地址。");
        return;
      }
      if (ref.toLowerCase() === store.account.toLowerCase()) {
        toast("warn", "推荐人不能是自己", "请更换推荐人地址。");
        return;
      }
    } else if (needRef) {
      toast("warn", "请填写推荐人", "首单必须绑定一位已完成质押的上级。");
      return;
    }

    const value = slgUsd(amount);
    if (value !== null && store.pool) {
      if (store.pool.minStake && value < store.pool.minStake) {
        toast("warn", "低于最低入金", "当前最低约 " + usd(store.pool.minStake) + "。");
        return;
      }
      if (store.pool.maxStake && value > store.pool.maxStake) {
        toast("warn", "高于最高入金", "当前最高约 " + usd(store.pool.maxStake) + "。");
        return;
      }
    }

    setBusy(true);
    try {
      await assertContract(CFG.addresses.stakingPool, "质押池");
      await approveIfNeeded(amount);
      const poolContract = readContract("stakingPool", "stakingPool", store.readProvider);
      const ok = await preflight("质押", () =>
        poolContract.stake.staticCall(amount, ref, { from: store.account })
      );
      if (!ok) return;
      const tx = await walletSend({
        to: CFG.addresses.stakingPool,
        data: encodeCall("stakingPool", "stake", [amount, ref])
      });
      toast("info", "质押交易已提交", maskHash(tx.hash), 6000);
      checkReceipt(await tx.wait());
      toast("success", "质押成功", "订单已开立，收益开始按轮累计。", 7000);
      store.autoAmount = "";
    } catch (err) {
      toast("error", "质押失败", errorText(err), 9000);
    } finally {
      setBusy(false);
      await refreshAll(true);
    }
  }

  async function doExit() {
    if (store.busy) return;
    if (!(await ensureWallet())) return;

    const value = exitTriggerBNB();
    if (!value || value <= 0n) {
      toast("warn", "门槛未读取", "请刷新后重试。");
      return;
    }
    const shown = fmtUnits(value, 18, 6);
    if (!skipLocalChecks() && store.user && store.user.bnbBalance < value) {
      toast(
        "warn",
        "BNB 余额不足",
        "钱包持有 " + bnbBalanceText(store.user.bnbBalance) + "，本次触发额 " + bnbBalanceText(value) + "。",
        9000
      );
      return;
    }
    if (!window.confirm(
      "确认提交出局？\n\n将附带 " + shown + " BNB 作为触发额，\n合约会在同一笔交易里原额退回，实际只消耗 gas。"
    )) return;

    setBusy(true);
    try {
      await assertContract(CFG.addresses.stakingPool, "质押池");
      const provider = store.readProvider || store.browserProvider;
      const ok = await preflight("出局", () =>
        provider.call({ from: store.account, to: CFG.addresses.stakingPool, value })
      );
      if (!ok) return;
      const tx = await walletSend({ to: CFG.addresses.stakingPool, value });
      toast("info", "出局交易已提交", maskHash(tx.hash), 6000);
      checkReceipt(await tx.wait());
      await refreshAll(true);
      if (store.order && store.order.active) {
        toast("warn", "未完成出局", "订单仍在计息中：可能未到期或未达收益上限，附带 BNB 已退回。", 9000);
      } else {
        toast("success", "出局完成", "本轮利息与本金已释放，附带 BNB 已退回。", 8000);
      }
    } catch (err) {
      toast("error", "出局失败", errorText(err), 9000);
      await refreshAll(true);
    } finally {
      setBusy(false);
    }
  }

  async function buyNode(kind) {
    if (store.busy) return;
    if (!(await ensureWallet())) return;
    if (skipLocalChecks()) {
      // Mobile: the user is waiting for the wallet popup, so fetch only the
      // values the transaction needs and let the dashboard load afterwards.
      if (!store.node || !store.node.foundingPrice) {
        const c = readContract("nodeProgram", "nodeProgram");
        const r = await runLimited(
          [
            () => c.foundingPrice(),
            () => c.coFounderPrice(),
            () => c.foundingSold(),
            () => c.coFounderSold(),
            () => c.FOUNDING_SUPPLY(),
            () => c.COFOUNDER_SUPPLY(),
            () => c.salesPaused()
          ],
          4
        );
        if (!r[0] || r[0] === 0n) {
          toast("error", "价格读取失败", "公共节点读取失败，请稍后重试。", 9000);
          return;
        }
        store.node = {
          foundingPrice: r[0],
          coFounderPrice: r[1] || 0n,
          foundingSold: num(r[2]),
          coFounderSold: num(r[3]),
          foundingSupply: num(r[4]) || 33,
          coFounderSupply: num(r[5]) || 99,
          salesPaused: !!r[6]
        };
      }
      loadPublic().catch(() => {});
      loadAccount().catch(() => {});
    } else {
      if (!store.node) await loadPublic();
      await loadAccount();
    }
    // Balances loaded at connect time go stale; a purchase must judge on the
    // wallet's current native BNB, not the cached value.
    if (store.account && store.user) {
      const provider = store.browserProvider || store.readProvider;
      try {
        store.user.bnbBalance = await provider.getBalance(store.account);
      } catch {
      }
    }

    const node = store.node;
    if (!node) {
      toast(
        "error",
        "链上数据未加载",
        "公共 RPC 读取失败，请点击刷新或稍后重试后再购买。",
        9000
      );
      return;
    }
    const founding = kind === "founding";
    const price = founding ? node.foundingPrice : node.coFounderPrice;
    if (!price) {
      toast("error", "价格读取失败", "请稍后刷新重试。");
      return;
    }
    if (node.salesPaused) {
      toast("warn", "销售已暂停", "当前无法购买节点。");
      return;
    }
    const sold = founding ? node.foundingSold : node.coFounderSold;
    const cap = founding ? node.foundingSupply : node.coFounderSupply;
    if (sold !== null && sold >= cap) {
      toast("warn", "已售罄", "该类席位已全部售出。");
      return;
    }

    const input = $(founding ? "referrerFounding" : "referrerCoFounder");
    const rawRef = input ? input.value.trim() : "";
    let ref = ZERO;
    if (rawRef) {
      try {
        ref = U.getAddress(rawRef);
      } catch {
        toast("warn", "地址格式无效", "请检查推荐人地址。");
        return;
      }
      if (ref.toLowerCase() === store.account.toLowerCase()) {
        toast("warn", "推荐人不能是自己", "请更换推荐人地址。");
        return;
      }
    }

    const label = founding ? "创始节点" : "联创节点";
    const fnName = founding ? "buyFounding" : "buyCoFounder";
    setBusy(true);
    try {
      await assertContract(CFG.addresses.nodeProgram, "节点合约");

      const nodeContract = readContract("nodeProgram", "nodeProgram", store.readProvider);
      const estimated = await estimateNetworkFee({
        to: CFG.addresses.nodeProgram,
        value: price,
        data: encodeCall("nodeProgram", fnName, [ref])
      });
      const fee = estimated !== null ? estimated : 2_000_000_000_000_000n;
      if (!skipLocalChecks() && store.user && store.user.bnbBalance < price + fee) {
        toast(
          "error",
          "BNB 余额不足以支付网络费",
          "本次需要 " + bnbBalanceText(price) + " + 约 " + bnbBalanceText(fee) +
            " 网络费，钱包当前 " + bnbBalanceText(store.user.bnbBalance) + "。请补充 BNB 后重试。",
          12000
        );
        return;
      }

      const ok = await preflight(label + "购买", () =>
        nodeContract[fnName].staticCall(ref, { value: price, from: store.account })
      );
      if (!ok) return;

      const tx = await walletSend({
        to: CFG.addresses.nodeProgram,
        value: price,
        data: encodeCall("nodeProgram", fnName, [ref])
      });
      toast("info", "购买已提交", label + " · " + maskHash(tx.hash), 6000);
      checkReceipt(await tx.wait());
      toast("success", "购买成功", label + "席位已登记，可随时领取分红。", 8000);
      if (input) input.value = "";
    } catch (err) {
      toast("error", "购买失败", errorText(err), 9000);
    } finally {
      setBusy(false);
      await refreshAll(true);
    }
  }

  async function claimDividend(kind) {
    if (store.busy) return;
    if (!(await ensureWallet())) return;
    const key = kind === "founding" ? "foundingDividend" : "coFounderDividend";
    const label = kind === "founding" ? "创始节点" : "联创节点";
    setBusy(true);
    try {
      await assertContract(CFG.addresses[key], label + "分红合约");
      const contract = readContract(key, "nodeDividend", store.readProvider);
      const ok = await preflight(label + "领取", () =>
        contract.claim.staticCall({ from: store.account })
      );
      if (!ok) return;
      const tx = await walletSend({
        to: CFG.addresses[key],
        data: encodeCall("nodeDividend", "claim", [])
      });
      toast("info", "领取已提交", label + " · " + maskHash(tx.hash), 6000);
      checkReceipt(await tx.wait());
      toast("success", "分红已领取", "SLG 已转入钱包。", 7000);
    } catch (err) {
      toast("error", "领取失败", errorText(err), 9000);
    } finally {
      setBusy(false);
      await refreshAll(true);
    }
  }

  async function claimDeferred() {
    if (store.busy) return;
    if (!(await ensureWallet())) return;
    setBusy(true);
    try {
      await assertContract(CFG.addresses.stakingPool, "质押池");
      const poolContract = readContract("stakingPool", "stakingPool", store.readProvider);
      const ok = await preflight("补发利息领取", () =>
        poolContract.claimDeferred.staticCall({ from: store.account })
      );
      if (!ok) return;
      const tx = await walletSend({
        to: CFG.addresses.stakingPool,
        data: encodeCall("stakingPool", "claimDeferred", [])
      });
      toast("info", "领取已提交", maskHash(tx.hash), 6000);
      checkReceipt(await tx.wait());
      toast("success", "补发利息已领取", "SLG 已转入钱包。", 7000);
    } catch (err) {
      toast("error", "领取失败", errorText(err), 9000);
    } finally {
      setBusy(false);
      await refreshAll(true);
    }
  }


  function pancakeRouter(runner) {
    if (!CFG.pancake || !CFG.pancake.router) return null;
    return new U.Contract(CFG.pancake.router, ABI.pancakeRouter, runner || store.readProvider);
  }

  async function loadBuyback() {
    if ((PAGE !== "stake" && PAGE !== "home") || !store.readProvider) return;
    const pool = readContract("stakingPool", "stakingPool");
    const wbnb = new U.Contract(CFG.pancake.wbnb, ABI.erc20, store.readProvider);
    const r = await runLimited(
      [
        () => wbnb.balanceOf(CFG.addresses.stakingPool),
        () => wbnb.balanceOf(CFG.addresses.nodeProgram),
        () => pool.totalBuybackSLG(),
        () => pool.yieldReserveSLG(),
        () => pool.swapToleranceBps()
      ],
      5
    );

    const b = store.buyback;
    b.poolWbnb = r[0] || 0n;
    b.nodeWbnb = r[1] || 0n;
    b.total = r[2] || 0n;
    b.reserve = r[3] || 0n;
    b.tolerance = r[4] === null ? 0 : num(r[4]);
    b.quoted = null;
    b.error = null;

    const router = pancakeRouter(store.readProvider);
    if (b.poolWbnb > 0n && router) {
      const seq = ++b.seq;
      try {
        const amounts = await router.getAmountsOut(b.poolWbnb, [CFG.pancake.wbnb, CFG.token.slg]);
        if (seq === b.seq) b.quoted = amounts[amounts.length - 1];
      } catch (err) {
        if (seq === b.seq) b.error = err;
      }
    }
    renderBuyback();
  }

  function renderBuyback() {
    const btn = $("btnBuyback");
    if (!btn) return;
    const b = store.buyback;
    const has = b.poolWbnb > 0n;
    const floor = b.quoted && b.tolerance > 0
      ? (b.quoted * BigInt(10000 - b.tolerance)) / 10000n
      : 0n;

    setText("bbPoolWbnb", has ? fmtUnits(b.poolWbnb, 18, 6) + " WBNB" : "0 WBNB");
    setText(
      "bbNodeWbnb",
      b.nodeWbnb > 0n ? fmtUnits(b.nodeWbnb, 18, 6) + " WBNB" : "0 WBNB"
    );
    setText("bbQuoteSlg", b.quoted ? fmtUnits(b.quoted, store.decimals.slg, 2) + " SLG" : "—");
    setText("bbFloor", floor > 0n ? fmtUnits(floor, store.decimals.slg, 2) + " SLG" : "—");
    setText(
      "bbReserveAfter",
      b.quoted ? fmtUnits(b.reserve + b.quoted, store.decimals.slg, 2) + " SLG" : "—"
    );
    setText("bbReserve", fmtUnits(b.reserve, store.decimals.slg, 2) + " SLG");
    setText("bbTotal", fmtUnits(b.total, store.decimals.slg, 2) + " SLG");
    setText("bbTolerance", b.tolerance > 0 ? (b.tolerance / 100).toFixed(2) + "%" : "—");
    setText("bbPoolAddr", shortAddr(CFG.addresses.stakingPool));
    const addrEl = $("bbPoolAddr");
    if (addrEl) addrEl.title = CFG.addresses.stakingPool;

    const stray = b.nodeWbnb > 0n;
    const tag = $("bbStateTag");
    if (tag) {
      if (has) {
        tag.textContent = "可触发";
        tag.className = "tag live";
      } else if (stray) {
        tag.textContent = "待归集";
        tag.className = "tag warn";
      } else {
        tag.textContent = "待注入";
        tag.className = "tag";
      }
    }

    const hint = $("bbHint");
    if (hint) {
      if (b.error) hint.textContent = "报价失败，请稍后刷新重试";
      else if (!has && stray) {
        hint.textContent =
          "检测到节点合约内有 " + fmtUnits(b.nodeWbnb, 18, 6) +
          " WBNB。回购只能动用质押池余额，需在后台「归集节点合约 WBNB」把它转入质押池后才能触发。";
      } else if (!has) {
        hint.textContent = "池内暂无 WBNB。向质押池转入 WBNB 后即可触发回购。";
      } else if (stray) {
        hint.textContent =
          "质押池可回购 " + fmtUnits(b.poolWbnb, 18, 6) + " WBNB；另有 " +
          fmtUnits(b.nodeWbnb, 18, 6) + " WBNB 留在节点合约，需后台归集后才会计入回购。";
      } else {
        hint.textContent = "触发后将把池内全部 WBNB 换成 SLG 并计入收益储备，仅消耗 gas。";
      }
    }

    btn.disabled = store.busy || !has || !store.readProvider;
  }

  async function doBuyback() {
    if (store.busy) return;
    if (!store.readProvider) return;
    if (store.buyback.poolWbnb <= 0n) {
      toast("warn", "池内没有 WBNB", "请先向质押池转入 WBNB 再触发回购。");
      return;
    }
    if (!(await ensureWallet())) return;

    setBusy(true);
    try {
      await assertChain();
      const pool = readContract("stakingPool", "stakingPool", store.readProvider);
      const ok = await preflight("触发回购", () =>
        pool.buybackWbnb.staticCall(0, { from: store.account })
      );
      if (!ok) return;
      const tx = await walletSend({
        to: CFG.addresses.stakingPool,
        data: encodeCall("stakingPool", "buybackWbnb", [0])
      });
      toast("info", "回购已提交", maskHash(tx.hash), 6000);
      checkReceipt(await tx.wait());
      toast("success", "回购成功", "池内 WBNB 已换成 SLG 并计入收益储备。", 9000);
    } catch (err) {
      toast("error", "回购失败", errorText(err), 9000);
    } finally {
      setBusy(false);
      await refreshAll(true);
      await loadBuyback();
    }
  }


  function tick() {
    if (PAGE !== "stake") return;
    if (!store.order || !store.order.active) return;
    renderRound();
    if (store.account && store.user && !store.user.mature && !store.user.canExit) {
      const end = store.order.roundStart + (store.pool ? store.pool.roundDuration : 0);
      const left = end - nowSeconds();
      const btn = $("btnStake");
      if (left > 0 && btn) {
        btn.textContent = "计息中 · 剩余 " + countdown(left);
      } else if (left <= 0) {
        if (btn) btn.textContent = "质押（SLG）";
        const key = store.order.roundStart + ":" + (store.pool ? store.pool.roundDuration : 0);
        if (store.matureKey !== key) {
          store.matureKey = key;
          loadAccount();
        }
      }
    }
  }

  function bind() {
    const on = (id, fn, evt) => {
      const el = $(id);
      if (el) el.addEventListener(evt || "click", fn);
    };

    on("connectBtn", () => {
      if (store.account) disconnectWallet();
      else connectWallet();
    });
    on("btnStake", doStake);
    on("btnExit", doExit);
    on("btnBuyFounding", () => buyNode("founding"));
    on("btnBuyCoFounder", () => buyNode("cofounder"));
    on("btnClaimFounding", () => claimDividend("founding"));
    on("btnClaimCoFounder", () => claimDividend("cofounder"));
    on("btnClaimDeferred", claimDeferred);

    on("btnBuyback", doBuyback);
    on("btnBuybackRefresh", () => {
      loadBuyback().catch(() => {});
    });

    const refreshBtn = $("btnRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        if (store.busy) return;
        refreshBtn.classList.add("is-loading");
        try {
          await refreshAll(true);
          toast("success", "数据已刷新", "已重新读取链上状态。", 3000);
        } catch {
          toast("warn", "刷新失败", "请检查网络后重试。");
        } finally {
          refreshBtn.classList.remove("is-loading");
        }
      });
    }

    const amountInput = $("amountInput");
    if (amountInput) {
      amountInput.addEventListener("input", () => {
        if (store.syncingUsd) return;
        store.autoAmount = "";
        const usdEl = $("usdInput");
        if (usdEl) {
          usdEl.value = "";
          setText("usdHint", "输入美元金额，自动换算 SLG（代币精度 " + store.decimals.slg + "）");
        }
        updateDerived();
      });
    }

    const usdInput = $("usdInput");
    if (usdInput) {
      usdInput.addEventListener("input", () => {
        if (store.syncingUsd) return;
        applyUsdShortcut();
      });
    }

    const referrerInput = $("referrerInput");
    if (referrerInput) {
      referrerInput.addEventListener("input", () => {
        referrerInput.dataset.touched = "1";
      });
    }


    on("btnMax", () => {
      if (!store.account) {
        toast("info", "请先连接钱包", "连接后可读取钱包 SLG 余额。");
        return;
      }
      if (!store.user || !amountInput) return;
      amountInput.value = rawUnits(store.user.slgBalance, store.decimals.slg);
      store.autoAmount = "";
      const usdEl = $("usdInput");
      if (usdEl) {
        usdEl.value = "";
        setText("usdHint", "输入美元金额，自动换算 SLG（代币精度 " + store.decimals.slg + "）");
      }
      updateDerived();
    });

    if (window.ethereum && typeof window.ethereum.on === "function") {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (!accounts || accounts.length === 0) {
          disconnectWallet();
        } else {
          store.account = U.getAddress(accounts[0]);
          store.signer = null;
          store.matureKey = null;
          bootstrapAccount(true).catch(() => {});
        }
      });
      window.ethereum.on("chainChanged", () => {
        toast("info", "网络已切换", "请确认钱包已切回 BSC 主网后点击刷新。", 7000);
      });
    }

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
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    items.forEach((el) => io.observe(el));
  }

  async function restoreWallet() {
    if (!window.ethereum) return;
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) return;

      const chainOk = await ensureChain();
      store.browserProvider = new U.BrowserProvider(window.ethereum);
      await bootstrapAccount(true);
      if (!chainOk) {
        toast(
          "warn",
          "钱包网络不是 BSC",
          "请在钱包中切换到 BNB Smart Chain（Chain ID 56）后再交易。",
          9000
        );
      }
    } catch {
    }
  }

  async function init() {
    bind();
    setupReveal();
    renderWallet();
    renderStake();
    setText("footerVersion", CFG.version || "—");

    store.readProvider = await pickReadProvider();
    await loadTokenMeta();
    await loadPublic();
    await restoreWallet();

    if (PAGE === "levels") renderLevels();

    window.setInterval(tick, 1000);
  }

  const boot = () =>
    init().catch((err) => {
      console.error(err);
      toast("error", "页面初始化失败", errorText(err), 10000);
    });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
