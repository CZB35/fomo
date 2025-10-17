# AI Fomo King

一个完整可运行的 Web3 DApp：Solidity 智能合约 + Next.js 前端 + SSE AI 故事流。

## 合约
- 文件：`src/AIFomoKing.sol`
- 特性：
  - 1U 入场（ERC20，默认 6 位小数），入场费按构造参数拆分：开发者即时手续费 devEntryBps，邀请返佣 referralBps，其余进奖池。
  - 每次留言重置倒计时；倒计时结束最后留言者赢得奖池；结算再抽取 winFeeBps 给开发者。
  - addInitialReward() 可由 owner 注资。
  - 奖池金额对未入场玩家隐藏，入场后可见。
  - extendRoundDuration(extraTime) 由 owner 延长当前轮倒计时。
  - 邀请系统：玩家可 setInviteCode(bytes32) 生成唯一邀请码；首次留言可携带 inviterCode 绑定邀请关系；直推 5% 返佣（按 referralBps）；支持多层关系记录（仅直推返佣）。
  - 事件：NewMessage、RoundWon、InviteCodeSet、InviteBound。

默认参数建议（测试网）：
- entranceFee=1_000_000 (1 USDT)
- devEntryBps=1000 (10%)
- referralBps=500 (5%)
- winFeeBps=500 (5%)
- roundDuration=600~900 秒

注意：如需严格“0.1U 开发者 + 0.9U 奖池”，请将 referralBps 设为 0；或调高 entranceFee 以覆盖返佣。

## 本地/测试部署（Foundry）
1. 安装依赖并编译：
   - `forge build`
2. 可选：部署 MockUSDT（本地测试）：
   - 文件：`src/mocks/MockUSDT.sol`
3. 部署脚本：`script/Deploy.s.sol`
   - 环境变量：
     - `TOKEN` 稳定币地址（例如 BSC Testnet USDT 或自部署的 MockUSDT）
     - `DEV_WALLET` 开发者地址
     - `ENTRANCE_FEE` `DEV_ENTRY_BPS` `REFERRAL_BPS` `ROUND_DURATION` `WIN_FEE_BPS`
   - 执行（BSC Testnet 示例）：
     - `forge script script/Deploy.s.sol:Deploy --rpc-url $BSC_TESTNET_RPC --broadcast`（按需加 `--verify`）

部署后记录合约地址，供前端使用。

## 前端（Next.js）
- 目录：`web/`
- 主要文件：
  - `app/page.tsx`：连接钱包、留言/邀请码、倒计时、奖池（入场后可见）、留言墙、邀请信息、SSE 故事面板。
  - `app/api/story-sse/route.ts`：SSE 流（默认 Mock）。设置 `OPENAI_API_KEY` 可接入模型（可自行扩展）。
  - `abi/AIFomoKing.json`：ABI。
  - `lib/wagmi.ts`：链与 RPC 配置。
  - `.env.example`：环境变量示例。

### 配置
复制 `web/.env.example` 为 `web/.env.local`，填写：
- `NEXT_PUBLIC_RPC_URL` 测试网 RPC
- `NEXT_PUBLIC_CHAIN_ID` 链 ID（BSC Testnet=97 / Base Sepolia=84532）
- `NEXT_PUBLIC_CONTRACT_ADDRESS` 合约地址
- `NEXT_PUBLIC_TOKEN_ADDRESS` USDT/ERC20 地址
- `NEXT_PUBLIC_TOKEN_DECIMALS` 默认 6
- `OPENAI_API_KEY`（可选）

### 运行
```bash
cd web
npm i
npm run dev
```
打开 http://localhost:3000

## 交互说明
- 首次使用可“设置/生成邀请码”，生成 bytes32 码（UI 中输入字符串会自动转 bytes32）。
- 新玩家留言时可填写邀请码绑定直推关系；直推人即时得到 `referralBps` 的返佣。
- 活动进行时，留言会触发倒计时刷新；时间截止后任何人可调用 `finalize()` 结算。
- 前端监听 NewMessage、RoundWon 自动更新留言墙、奖池、邀请数据；回合结束自动触发 AI 故事 SSE。

## 测试网
- BSC Testnet / Base Sepolia 均可。请自备测试 USDT 或部署 `MockUSDT` 进行演示。

## 可选扩展
- NFT 化故事：在回合结束时将故事文本上链或铸造 NFT（可在 `RoundWon` 后由前端/后端触发）。
- 主题模式：前端新增下拉选择，将主题传入 SSE 接口生成对应风格故事。
- 排行榜：基于事件与邀请映射统计（可用后端/子图聚合）。
