import { http, createConfig } from 'wagmi'
import { createPublicClient, defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97)
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com'

export const customChain = defineChain({
  id: chainId,
  name: chainId === 97 ? 'BSC Testnet' : 'Custom',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
})

export const config = createConfig({
  chains: [customChain],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  transports: { [customChain.id]: http(rpcUrl) },
  ssr: true,
})

export const publicClient = createPublicClient({ chain: customChain, transport: http(rpcUrl) })
