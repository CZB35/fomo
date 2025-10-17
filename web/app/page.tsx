"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useBalance, useConnect, useDisconnect, useReadContract, useWatchContractEvent, useWriteContract } from 'wagmi'
import { CONTRACT_ADDRESS, TOKEN_DECIMALS, DEFAULT_INVITE_CODE } from '../lib/config'
import abi from '../abi/AIFomoKingNative.json'
import { publicClient } from '../lib/wagmi'

export default function Page() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { writeContractAsync, isPending: isWriting } = useWriteContract()

  const wrongChain = chain && chain.id !== 97

  const handleConnect = async () => {
    try {
      if (connectors.length === 0) {
        alert('⚠️ 未检测到钱包，请安装 MetaMask 或其他钱包插件')
        setLog(prev => ['No connectors available', ...prev])
        return
      }
      // Try injected first (MetaMask/wallet browser); fallback to first available
      const connector = connectors.find(c => c.id === 'injected' || c.type === 'injected') || connectors[0]
      await connect({ connector })
    } catch (e: any) {
      const errorMsg = String(e?.message || e)
      console.error('Connect error:', e)
      setLog(prev => [`Connect error: ${errorMsg}`, ...prev])
      
      if (errorMsg.includes('user rejected') || errorMsg.includes('User rejected')) {
        alert('❌ 连接已取消')
      } else {
        alert(`❌ 钱包连接失败：\n\n${errorMsg.slice(0, 150)}`)
      }
    }
  }

  const [message, setMessage] = useState('')
  const [inviteCodeInput, setInviteCodeInput] = useState(DEFAULT_INVITE_CODE)
  const [log, setLog] = useState<string[]>([])
  const [roundMessages, setRoundMessages] = useState<{player: string; message: string; ts: number}[]>([])
  const [story, setStory] = useState('')
  const [wonRound, setWonRound] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)

  const { data: entranceFee, error: feeError, isLoading: feeLoading } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'entranceFee' })

  useEffect(() => {
    const msg = `Contract: ${CONTRACT_ADDRESS || 'UNDEFINED'} (Native tBNB payment)`
    setLog(prev => [msg, ...prev])
    if (!CONTRACT_ADDRESS) {
      setLog(prev => ['ERROR: CONTRACT_ADDRESS is undefined - check .env.local and restart dev server', ...prev])
    }
  }, [])

  // Fetch historical messages on mount and poll every 3 seconds
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber()
        const fromBlock = currentBlock > 5000n ? currentBlock - 5000n : 0n
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: abi.find((item: any) => item.type === 'event' && item.name === 'NewMessage') as any,
          fromBlock,
          toBlock: 'latest'
        })
        console.log('Fetched messages:', logs.length)
        const messages = logs.map((log: any) => {
          const { player, message: msg, timestamp: ts } = log.args
          return { player: player as string, message: msg as string, ts: Number(ts) }
        })
        setRoundMessages(messages)
        if (messages.length > 0) {
          setLog(prev => [`Loaded ${messages.length} messages`, ...prev.slice(0, 10)])
        }
      } catch (e: any) {
        console.error('Failed to fetch messages:', e)
      }
    }
    fetchMessages()
    const interval = setInterval(fetchMessages, 3000) // Poll every 3 seconds
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (feeError) setLog(prev => [`Fee read error: ${feeError.message}`, ...prev])
  }, [feeError])

  useEffect(() => {
    if (entranceFee) setLog(prev => [`entranceFee loaded: ${entranceFee.toString()}`, ...prev])
    else if (!feeLoading && !feeError) setLog(prev => ['entranceFee is undefined (check RPC/contract)', ...prev])
  }, [entranceFee, feeLoading, feeError])
  const { data: visiblePot } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'visiblePot', account: address as any, query: { enabled: !!address, refetchInterval: 3000 } })
  const { data: timeLeft } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'timeLeft', query: { refetchInterval: 2000 } })
  const { data: roundActive } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'roundActive', query: { refetchInterval: 2000 } })
  const { data: hasAccess } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'hasAccess', args: [address!], query: { enabled: !!address, refetchInterval: 3000 } })
  const { data: lastPlayer } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'lastPlayer', query: { refetchInterval: 3000 } })
  const { data: currentRound } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'currentRound', query: { refetchInterval: 5000 } })
  const { data: inviteCodeMine } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'inviteCodeOf', args: [address!], query: { enabled: !!address } })
  const { data: inviteeCount } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'inviteeCount', args: [address!], query: { enabled: !!address } })
  const { data: referralRewards } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'referralRewardReceived', args: [address!], query: { enabled: !!address } })
  const { data: balanceData } = useBalance({ address, query: { enabled: !!address } })

  // Watch NewMessage events
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: abi as any,
    eventName: 'NewMessage',
    onLogs(logs) {
      console.log('NewMessage events received:', logs)
      for (const l of logs) {
        console.log('Event log:', l)
        const args = (l as any).args as any
        console.log('Args:', args)
        const player = args.player || args[0]
        const msg = args.message || args[1]
        const ts = args.timestamp || args[2]
        const newMsg = { player: player as string, message: msg as string, ts: Number(ts) }
        console.log('Parsed message:', newMsg)
        setRoundMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.player === newMsg.player && m.ts === newMsg.ts && m.message === newMsg.message)) {
            console.log('Duplicate, skipping')
            return prev
          }
          console.log('Adding new message to wall')
          return [...prev, newMsg]
        })
        setLog(prev => [`New message from ${player?.slice(0,6)}...`, ...prev])
      }
    },
  })

  // Watch RoundWon -> start story SSE
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: abi as any,
    eventName: 'RoundWon',
    onLogs(logs) {
      for (const l of logs) {
        const [winner, amount, round] = (l as any).args as any
        setWonRound(Number(round))
        startStoryStream(Number(round))
      }
    },
  })

  async function onSend() {
    try {
      if (!entranceFee) {
        alert('⚠️ 入场费未加载，请稍后再试')
        throw new Error('entrance fee not loaded')
      }
      
      if (!message.trim()) {
        alert('⚠️ 请输入留言内容')
        return
      }
      
      // Validate invite code is not sender's own address
      if (inviteCodeInput && inviteCodeInput.toLowerCase() === address?.toLowerCase()) {
        alert('⚠️ 不能使用自己的地址作为邀请码！\n\n请留空或填写其他人的钱包地址。')
        return
      }
      
      const inviterBytes32 = addressOrStringToBytes32(inviteCodeInput)
      await writeContractAsync({ 
        abi: abi as any, 
        address: CONTRACT_ADDRESS, 
        functionName: 'sendMessage', 
        args: [message, inviterBytes32],
        value: entranceFee as bigint
      })
      setMessage('')
      alert('✅ 留言发送成功！')
    } catch (e: any) {
      const errorMsg = String(e?.message || e)
      console.error('Send error:', e)
      setLog(prev => [errorMsg, ...prev])
      
      // Show user-friendly error messages
      if (errorMsg.includes('user rejected') || errorMsg.includes('User rejected')) {
        alert('❌ 交易已取消')
      } else if (errorMsg.includes('insufficient funds')) {
        alert('⚠️ 余额不足，请充值 tBNB')
      } else if (errorMsg.includes('SELF_INVITE')) {
        alert('⚠️ 不能邀请自己！')
      } else if (errorMsg.includes('InvalidCode')) {
        alert('⚠️ 邀请码无效')
      } else if (!errorMsg.includes('entrance fee not loaded')) {
        alert(`❌ 发送失败：\n\n${errorMsg.slice(0, 200)}`)
      }
    }
  }

  async function setMyInviteCode() {
    try {
      const code = prompt('请输入邀请码（字母数字，不超过32字节）', inviteCodeInput || '') || ''
      if (!code) return
      const bytes32 = stringToBytes32(code)
      await writeContractAsync({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'setInviteCode', args: [bytes32] })
    } catch (e:any) {
      setLog(prev => [String(e?.message || e), ...prev])
    }
  }

  const inviteCodeStr = useMemo(() => bytes32ToString(inviteCodeMine as any), [inviteCodeMine])
  
  // Generate invite link with current wallet address
  const inviteLink = typeof window !== 'undefined' && address
    ? `${location.origin}?ref=${address}`
    : ''

  // Auto-fill invite code from URL ?ref=0x123...
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(location.href)
    const refAddress = url.searchParams.get('ref')
    if (refAddress && refAddress.startsWith('0x')) {
      setInviteCodeInput(refAddress)
    }
  }, [])

  // Initialize countdown from contract
  useEffect(() => {
    if (timeLeft) {
      setCountdown(Number(timeLeft))
    }
  }, [timeLeft])

  // Real-time countdown decrement
  useEffect(() => {
    if (countdown <= 0) return
    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [countdown])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function startStoryStream(round: number) {
    setStory('')
    const evtSrc = new EventSource(`/api/story-sse?round=${round}`)
    evtSrc.onmessage = (ev) => {
      if (ev.data === '[DONE]') {
        evtSrc.close()
      } else {
        setStory(prev => prev + ev.data)
      }
    }
    evtSrc.onerror = () => evtSrc.close()
  }

  return (
    <div className="container">
      <div className="h1">AI Fomo King</div>

      <div className="card">
        <div className="h2">👛 钱包</div>
        {!isConnected ? (
          <div style={{textAlign:'center', padding:'20px'}}>
            <button className="btn" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? '连接中...' : '🔗 连接钱包'}
            </button>
          </div>
        ) : (
          <div>
            <div className="wallet-info">
              <div className="wallet-address">
                <span className="wallet-label">地址</span>
                <span className="tag">{address?.slice(0,8)}...{address?.slice(-6)}</span>
              </div>
              <button className="btn btn-small" onClick={() => disconnect()}>断开</button>
            </div>
            {wrongChain && (
              <div style={{color:'#ef4444', marginTop:'12px', padding:'12px', background:'rgba(239, 68, 68, 0.1)', borderRadius:'8px', fontWeight:600, textAlign:'center'}}>
                ⚠️ 请切换到 BSC Testnet (Chain ID 97)
              </div>
            )}
            <div className="balance-display">
              <div className="balance-label">余额</div>
              <div className="balance-amount">
                {balanceData ? Number(formatUnits(balanceData.value, 18)).toFixed(4) : '0.0000'} <span className="balance-unit">tBNB</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {isConnected && !!hasAccess && (
        <div className="pot-card">
          <div className="pot-label">🏆 当前奖池</div>
          <div className="pot-amount">
            {visiblePot ? Number(formatUnits(visiblePot as bigint, 18)).toFixed(4) : '0.0000'} <span className="pot-unit">tBNB</span>
          </div>
          <div className="pot-hint">✨ 最后留言者赢得奖池</div>
        </div>
      )}

      {isConnected && (
        <div className="card">
          <div className="h2">🎁 邀请奖励</div>
          <div className="invite-stats">
            <div className="invite-stat-item">
              <div className="invite-stat-value">{inviteeCount?.toString() || '0'}</div>
              <div className="invite-stat-label">邀请人数</div>
            </div>
            <div className="invite-stat-item">
              <div className="invite-stat-value">{referralRewards ? Number(formatUnits(referralRewards as bigint, 18)).toFixed(4) : '0.0000'} tBNB</div>
              <div className="invite-stat-label">累计奖励</div>
            </div>
          </div>
          <div style={{marginTop:'20px'}}>
            <div className="small" style={{marginBottom:'8px', color:'#64748b'}}>🔗 我的邀请链接</div>
            <input 
              className="input" 
              readOnly 
              value={inviteLink || '连接钱包后显示'} 
              style={{marginBottom:'8px', cursor: inviteLink ? 'pointer' : 'default'}} 
              onClick={(e) => inviteLink && (e.target as HTMLInputElement).select()}
            />
            {inviteLink && (
              <button 
                className="btn" 
                onClick={()=>{
                  navigator.clipboard.writeText(inviteLink!)
                  alert('邀请链接已复制到剪贴板！')
                }}
              >
                📋 复制邀请链接
              </button>
            )}
          </div>
        </div>
      )}

      <div className="message-card">
        <div className="message-card-header">
          <div className="h2">✍️ 留言上链</div>
          <div className="message-card-subtitle">支付入场费后，你的留言将永久上链</div>
        </div>
        
        <div className="message-input-group">
          <label className="input-label">💬 你的留言</label>
          <textarea 
            className="message-textarea" 
            placeholder="输入你想说的话..."
            value={message} 
            onChange={(e)=>setMessage(e.target.value)}
            rows={3}
            maxLength={200}
          />
          <div className="char-count">{message.length}/200</div>
        </div>

        <div className="message-input-group">
          <label className="input-label">🎁 邀请码（可选）</label>
          <input 
            className="input" 
            placeholder="填写邀请人的钱包地址"
            value={inviteCodeInput} 
            onChange={(e)=>setInviteCodeInput(e.target.value)} 
          />
        </div>

        <div className="message-submit-section">
          <div className="fee-display">
            <div className="fee-label">入场费</div>
            <div className="fee-value">
              {feeLoading ? '加载中...' : entranceFee ? Number(formatUnits(entranceFee as bigint, 18)).toFixed(4) : '0.001'} <span className="fee-unit">tBNB</span>
            </div>
          </div>
          <button 
            className="btn btn-primary btn-large" 
            onClick={onSend} 
            disabled={!isConnected || !message || isWriting}
          >
            {isWriting ? (
              <>🔄 发送中...</>
            ) : (
              <>🚀 支付并留言</>
            )}
          </button>
        </div>
        
        {feeError && (
          <div className="error-message">
            ⚠️ {feeError.message}
          </div>
        )}
      </div>

      <div className="card">
        <div className="h2">🏆 当前轮次 #{currentRound?.toString() || '1'}</div>
        {!roundActive && countdown === 0 ? (
          <div style={{textAlign:'center', padding:'40px 20px'}}>
            <div style={{fontSize:'48px', marginBottom:'16px'}}>🕒</div>
            <div style={{fontSize:'20px', color:'#64748b', marginBottom:'12px', fontWeight:600}}>等待游戏开始</div>
            <div className="small">发送第一条留言开启新一轮，倒计时将自动开始</div>
          </div>
        ) : (
          <>
            <div className="countdown">{formatTime(countdown)}</div>
            <div style={{textAlign:'center', marginTop:'12px'}}>
              <div className="small">倒计时结束后，最后留言者赢得奖池</div>
            </div>
          </>
        )}
        <div className="stat-row" style={{marginTop:'16px'}}>
          <span className="stat-label">当前国王</span>
          <span className="king">{lastPlayer ? `${(lastPlayer as string).slice(0,6)}...${(lastPlayer as string).slice(-4)}` : '暂无'}</span>
        </div>
        {countdown === 0 && !!roundActive && (
          <div style={{marginTop:'16px', padding:'20px', background:'rgba(16, 185, 129, 0.1)', borderRadius:'16px', textAlign:'center'}}>
            <div style={{fontSize:'20px', fontWeight:700, color:'#10b981', marginBottom:'8px'}}>🏁 轮次已结杞</div>
            <div className="small">下一个留言将自动结算奖池，获胜者收到奖金</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="h2">💎 弹幕墙 ({roundMessages.length} 条留言)</div>
        {roundMessages.length === 0 ? (
          <div className="danmaku-container" style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div className="empty-state">
              <div className="empty-state-icon">💌</div>
              <div>暂无留言，成为第一人！</div>
            </div>
          </div>
        ) : (
          <div className="danmaku-container">
            {roundMessages.slice(-30).map((m, i) => {
              const delay = (i * 1.2) % 15
              const track = (i % 6) * 50 + 20
              return (
                <div 
                  key={`${m.player}-${m.ts}-${i}`} 
                  className="danmaku-item"
                  style={{
                    top: `${track}px`,
                    animationDelay: `${delay}s`,
                    animationDuration: '15s'
                  }}
                >
                  <span className="danmaku-address">{m.player.slice(0,6)}...{m.player.slice(-4)}</span>
                  <span>{m.message}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {isConnected && (
        <div className="card">
          <div className="h2">📝 我的留言记录（本轮）</div>
          {roundMessages.filter(m => m.player.toLowerCase() === address?.toLowerCase()).length === 0 ? (
            <div style={{textAlign:'center', padding:'30px', color:'#94a3b8'}}>
              你还没有在本轮留言
            </div>
          ) : (
            <div className="my-messages">
              {roundMessages
                .filter(m => m.player.toLowerCase() === address?.toLowerCase())
                .reverse()
                .map((m, i) => {
                  const date = new Date(m.ts * 1000)
                  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  return (
                    <div key={`my-${m.ts}-${i}`} className="my-message-item">
                      <div className="my-message-time">{timeStr}</div>
                      <div className="my-message-content">{m.message}</div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* <div className="card">
        <div className="h2">🤖 AI 故事</div>
        {wonRound ? <div className="small">第 {wonRound} 轮</div> : null}
        <pre>{story || '等待轮次结束...'}</pre>
      </div> */}


      {/* {log.length>0 && (
        <div className="card">
          <div className="h2">日志</div>
          <pre>{log.join('\n')}</pre>
        </div>
      )} */}
    </div>
  )
}

function addressOrStringToBytes32(input: string): `0x${string}` {
  if (!input || input.trim() === '') {
    // Empty input, return zero bytes32
    return '0x0000000000000000000000000000000000000000000000000000000000000000'
  }
  
  // Check if input is a valid Ethereum address (0x + 40 hex chars)
  if (/^0x[0-9a-fA-F]{40}$/.test(input)) {
    // It's an address, pad with zeros to make it 32 bytes
    // Address is 20 bytes, so add 12 bytes of zeros at the front
    const addrHex = input.slice(2) // Remove 0x
    const padded = '0x' + '000000000000000000000000' + addrHex
    return padded as `0x${string}`
  }
  
  // Otherwise treat as string
  return stringToBytes32(input)
}

function stringToBytes32(str: string): `0x${string}` {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  if (bytes.length > 32) throw new Error('code too long')
  const out = new Uint8Array(32)
  out.set(bytes)
  return toHex(out) as `0x${string}`
}

function bytes32ToString(b: any): string {
  if (!b) return ''
  const hex = (b as string)
  const u8 = hexToU8(hex)
  const str = new TextDecoder().decode(u8)
  return str.replace(/\u0000+$/g, '').replace(/\x00+$/g, '').trim()
}

function toHex(u8: Uint8Array): string {
  return '0x' + Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToU8(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const len = clean.length / 2
  const out = new Uint8Array(len)
  for (let i=0;i<len;i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16)
  return out
}
