
window.SLG_CONFIG = {
  version: "v12",
  chainId: 56,
  chainName: "BSC Mainnet",
  explorer: "https://bscscan.com",
  rpcUrls: [
    'https://bsc-dataseed.bnbchain.org',    // BNB Chain 官方
    'https://bsc-dataseed1.bnbchain.org',   // BNB Chain 官方 1
    'https://bsc-dataseed2.bnbchain.org',   // BNB Chain 官方 2
    'https://bsc-dataseed3.bnbchain.org',   // BNB Chain 官方 3
    'https://bsc-dataseed4.bnbchain.org',   // BNB Chain 官方 4
    'https://bsc-dataseed2.defibit.io',     // 币安 defibit2
    'https://bsc-dataseed3.defibit.io',     // 币安 defibit3
    'https://bsc-dataseed4.defibit.io',     // 币安 defibit4
    'https://bsc.nodereal.io',              // NodeReal
    'https://bsc-rpc.publicnode.com',       // PublicNode
    'https://bsc-dataseed-public.bnbchain.org',
    'https://bsc-dataseed.nariox.org',
    'https://1rpc.io/bnb',
    'https://bsc.meowrpc.com',
    'https://rpc-bsc.48.club',              // 48Club 国内节点
    'https://bsc.mytokenpocket.vip',        // TokenPocket 官方通道
    'https://bsc-dataseed.defibit.io',
    'https://bsc-dataseed.ninicoin.io',
    'https://bsc-mainnet.public.blastapi.io'
  ],
  walletRpc: "https://bsc-dataseed.bnbchain.org",
  token: {
    slg: "0xdbb64ec2a453a612d0cc5001b6f15b0200000000",
    bni: "0x209e1c94a88318e2eae570bce87936589a90ffff",
    // SLG is a 0-decimal token: decimals() == 0 and totalSupply == 1e33.
    // Amounts are displayed in whole tokens, matching the wallet.
    // PriceHub still quotes per 1e18 raw units (slgUnit = 1e18), so USD value
    // stays raw * price / 1e18 and is independent of this display setting.
    slgDecimals: 0,
    bniDecimals: 18
  },
  pancake: {
    factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
    router: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
    wbnb: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    bniPair: "0x04daaa7088ee209101f33198f2da86c05b539121",
    slgPair: "0x831ad208f9b17afe61945f854026522567ae39fa"
  },
  addresses: {
    priceHub: "0x696b8ea39abdb4d1cefbc2c8736628a2006ec3f1",
    opsVault: "0xabecd3ff33bf93710190495273d77ea1dbe5358f",
    foundingDividend: "0x731b6b86eda70f907fbdbfedd0a251873d28a232",
    coFounderDividend: "0xc722731fd786e7b7548e60b97d01e91c0fd5f804",
    stakingPool: "0x2876ecb67e21a81965a13a6d680980b0084c6a03",
    nodeProgram: "0xb57379dcc973b93357cbc8e8006a828c8fe7cdff"
  }
};

window.SLG_ABI = {
  priceHub: [
    "function slgPriceUSD() view returns (uint256)",
    "function bnbPriceUSD() view returns (uint256)"
  ],

  pancakeFactory: [
    "function getPair(address tokenA, address tokenB) view returns (address)"
  ],

  pancakePair: [
    "function token0() view returns (address)",
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
  ],

  pancakeRouter: [
    "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)"
  ],

  nodeProgram: [
    "function foundingPrice() view returns (uint256)",
    "function coFounderPrice() view returns (uint256)",
    "function foundingSold() view returns (uint256)",
    "function coFounderSold() view returns (uint256)",
    "function FOUNDING_SUPPLY() view returns (uint256)",
    "function COFOUNDER_SUPPLY() view returns (uint256)",
    "function salesPaused() view returns (bool)",
    "function foundingNodes(address holder) view returns (uint256)",
    "function coFounderNodes(address holder) view returns (uint256)",
    "function nodesOf(address holder) view returns (uint256 founding, uint256 coFounder)",
    "function buyFounding(address referrer) payable",
    "function buyCoFounder(address referrer) payable",
    "error SoldOut()",
    "error WrongPrice()",
    "error SalesPausedError()",
    "error ZeroAddress()",
    "error BadReferrer()",
    "error TransferFailed()",
    "error SwapFailed()",
    "error InvalidParams()"
  ],

  nodeDividend: [
    "function pending(address holder) view returns (uint256)",
    "function claim() returns (uint256)",
    "function nodeCount() view returns (uint256)",
    "function capacity() view returns (uint256)",
    "function totalDistributed() view returns (uint256)",
    "function holdersCount() view returns (uint256)",
    "error Unauthorized()",
    "error SoldOut()",
    "error ZeroAddress()",
    "error ZeroAmount()",
    "error NothingToClaim()",
    "error NoNodes()",
    "error InvalidParams()"
  ],

  stakingPool: [
    "function orders(address user) view returns (uint256 depositSLG, uint256 principalSLG, uint256 depositUSD, uint256 principalUSD, uint256 roundStart, uint256 lastRound, uint256 earnedUSD, address referrer, bool active)",
    "function isMature(address user) view returns (bool)",
    "function canExit(address user) view returns (bool)",
    "function pendingReward(address user) view returns (uint256 amountUSD, uint256 amountSLG)",
    "function levelOf(address user) view returns (uint256 index, uint16 rateBps)",
    "function exitCapUSD(address user) view returns (uint256)",
    "function capBaseUSD(address user) view returns (uint256)",
    "function lifetimeEarnedUSD(address user) view returns (uint256)",
    "function rewardCeilingUSD(address user) view returns (uint256)",
    "function yieldReserveSLG() view returns (uint256)",
    "function minStakeUSD() view returns (uint256)",
    "function maxStakeUSD() view returns (uint256)",
    "function dailyRateBps() view returns (uint256)",
    "function roundDuration() view returns (uint256)",
    "function exitMultiple() view returns (uint16)",
    "function bniRateBps() view returns (uint16)",
    "function minExitTriggerBNB() view returns (uint256)",
    "function teamVolumeUSD(address user) view returns (uint256)",
    "function stakerCount() view returns (uint256)",
    "function totalPrincipalSLG() view returns (uint256)",
    "function totalRewardUSD() view returns (uint256)",
    "function totalDepositUSD() view returns (uint256)",
    "function totalDistributionUSD() view returns (uint256)",
    "function totalBuybackSLG() view returns (uint256)",
    "function buybackWbnb(uint256 minOut) returns (uint256 receivedSLG)",
    "function wbnb() view returns (address)",
    "function memberVolumeUSD(address user) view returns (uint256)",
    "function isSolvent() view returns (bool)",
    "function unpaidRewardUSD(address user) view returns (uint256)",
    "function totalUnpaidUSD() view returns (uint256)",
    "function directBps() view returns (uint16)",
    "function levelPoolBps() view returns (uint16)",
    "function opsBps() view returns (uint16)",
    "function foundingBps() view returns (uint16)",
    "function coFounderBps() view returns (uint16)",
    "function maxSlippageBps() view returns (uint16)",
    "function swapToleranceBps() view returns (uint256)",
    "function claimDeferred() returns (uint256)",
    "function isActiveStaker(address user) view returns (bool)",
    "function referrerOf(address user) view returns (address)",
    "function hasStaked(address user) view returns (bool)",
    "function levelThresholdUSD(uint256 index) view returns (uint256)",
    "function levelRateTierBps(uint256 index) view returns (uint16)",
    "function paused() view returns (bool)",
    "function stake(uint256 amount, address referrer)",
    "function minExitTriggerBNB() view returns (uint256)",
    "error ZeroAmount()",
    "error ZeroAddress()",
    "error NoOrder()",
    "error BadReferrer()",
    "error ReferrerRequired()",
    "error ReferrerNotStaker()",
    "error ReferralCycle()",
    "error BelowMinimum()",
    "error AboveMaximum()",
    "error NotMature()",
    "error RenewalTooSmall(uint256 required)",
    "error TriggerTooSmall()",
    "error ExitNotReady()",
    "error ExitAvailable()",
    "error TransferFailed()",
    "error InvalidParams()",
    "error InsufficientReserve()"
  ],

  opsVault: [
    "function getStats() view returns (uint256 accumulated, uint256 members, uint256 remaining, uint256 perShare)",
    "function getTokenStats(address token) view returns (uint256 accumulated, uint256 members, uint256 remaining, uint256 perShare)",
    "function oskToken() view returns (address)"
  ],

  erc20: [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)"
  ]
};
