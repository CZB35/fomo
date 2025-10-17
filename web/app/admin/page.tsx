"use client"

import { useEffect, useState } from 'react'
import { formatUnits, parseEther } from 'viem'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { CONTRACT_ADDRESS } from '../../lib/config'
import abi from '../../abi/AIFomoKingNative.json'
import Link from 'next/link'

export default function AdminPage() {
  const { address, isConnected } = useAccount()
  const { writeContractAsync, isPending: isWriting } = useWriteContract()

  const [roundDuration, setRoundDuration] = useState('')
  const [addRewardAmount, setAddRewardAmount] = useState('')
  const [devEntryBpsInput, setDevEntryBpsInput] = useState('')
  const [referralBpsInput, setReferralBpsInput] = useState('')
  const [winFeeBpsInput, setWinFeeBpsInput] = useState('')

  const { data: owner } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'owner' })
  const { data: currentRoundDuration } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'roundDuration' })
  const { data: pot } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'pot', query: { refetchInterval: 3000 } })
  const { data: roundActive } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'roundActive', query: { refetchInterval: 3000 } })
  const { data: devWallet } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'devWallet' })
  const { data: entranceFee } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'entranceFee' })
  const { data: devEntryBps } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'devEntryBps' })
  const { data: referralBps } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'referralBps' })
  const { data: winFeeBps } = useReadContract({ abi: abi as any, address: CONTRACT_ADDRESS, functionName: 'winFeeBps' })

  const isOwner = address && owner && address.toLowerCase() === (owner as string).toLowerCase()

  const handleSetRoundDuration = async () => {
    try {
      const seconds = parseInt(roundDuration)
      if (isNaN(seconds) || seconds < 60) {
        alert('⚠️ 轮次时长必须至少 60 秒')
        return
      }
      await writeContractAsync({
        abi: abi as any,
        address: CONTRACT_ADDRESS,
        functionName: 'setRoundDuration',
        args: [BigInt(seconds)]
      })
      alert('✅ 轮次时长已更新！' + (roundActive ? '（将在下一轮生效）' : ''))
      setRoundDuration('')
    } catch (e: any) {
      console.error(e)
      alert(`❌ 操作失败：${e?.message || e}`)
    }
  }

  const handleAddReward = async () => {
    try {
      const amount = parseFloat(addRewardAmount)
      if (isNaN(amount) || amount <= 0) {
        alert('⚠️ 请输入有效的金额')
        return
      }
      await writeContractAsync({
        abi: abi as any,
        address: CONTRACT_ADDRESS,
        functionName: 'addInitialReward',
        args: [],
        value: parseEther(addRewardAmount)
      })
      alert('✅ 奖励已添加到奖池！')
      setAddRewardAmount('')
    } catch (e: any) {
      console.error(e)
      alert(`❌ 操作失败：${e?.message || e}`)
    }
  }

  const handleSetDevEntryBps = async () => {
    try {
      const bps = parseFloat(devEntryBpsInput)
      if (isNaN(bps) || bps < 0 || bps > 100) {
        alert('⚠️ 请输入有效的百分比（0-100）')
        return
      }
      await writeContractAsync({
        abi: abi as any,
        address: CONTRACT_ADDRESS,
        functionName: 'setDevEntryBps',
        args: [BigInt(Math.round(bps * 100))]
      })
      alert('✅ 开发者入场费率已更新！' + (roundActive ? '（将在下一轮生效）' : ''))
      setDevEntryBpsInput('')
    } catch (e: any) {
      console.error(e)
      alert(`❌ 操作失败：${e?.message || e}`)
    }
  }

  const handleSetReferralBps = async () => {
    try {
      const bps = parseFloat(referralBpsInput)
      if (isNaN(bps) || bps < 0 || bps > 100) {
        alert('⚠️ 请输入有效的百分比（0-100）')
        return
      }
      await writeContractAsync({
        abi: abi as any,
        address: CONTRACT_ADDRESS,
        functionName: 'setReferralBps',
        args: [BigInt(Math.round(bps * 100))]
      })
      alert('✅ 推荐奖励费率已更新！' + (roundActive ? '（将在下一轮生效）' : ''))
      setReferralBpsInput('')
    } catch (e: any) {
      console.error(e)
      alert(`❌ 操作失败：${e?.message || e}`)
    }
  }

  const handleSetWinFeeBps = async () => {
    try {
      const bps = parseFloat(winFeeBpsInput)
      if (isNaN(bps) || bps < 0 || bps > 50) {
        alert('⚠️ 请输入有效的百分比（0-50）')
        return
      }
      await writeContractAsync({
        abi: abi as any,
        address: CONTRACT_ADDRESS,
        functionName: 'setWinFeeBps',
        args: [BigInt(Math.round(bps * 100))]
      })
      alert('✅ 开发者获胜费率已更新！' + (roundActive ? '（将在下一轮生效）' : ''))
      setWinFeeBpsInput('')
    } catch (e: any) {
      console.error(e)
      alert(`❌ 操作失败：${e?.message || e}`)
    }
  }

  if (!isConnected) {
    return (
      <div className="container">
        <div className="admin-header">
          <Link href="/" className="back-link">← 返回主页</Link>
          <h1 className="h1">🔧 管理面板</h1>
        </div>
        <div className="card" style={{textAlign: 'center', padding: '60px 20px'}}>
          <div style={{fontSize: '48px', marginBottom: '20px'}}>🔐</div>
          <div style={{fontSize: '20px', fontWeight: 600, marginBottom: '12px'}}>请先连接钱包</div>
          <div className="small">只有合约所有者可以访问此页面</div>
        </div>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="container">
        <div className="admin-header">
          <Link href="/" className="back-link">← 返回主页</Link>
          <h1 className="h1">🔧 管理面板</h1>
        </div>
        <div className="card" style={{textAlign: 'center', padding: '60px 20px'}}>
          <div style={{fontSize: '48px', marginBottom: '20px'}}>⛔</div>
          <div style={{fontSize: '20px', fontWeight: 600, marginBottom: '12px', color: '#ef4444'}}>访问被拒绝</div>
          <div className="small">只有合约所有者（{(owner as string)?.slice(0, 8)}...{(owner as string)?.slice(-6)}）可以访问此页面</div>
          <div className="small" style={{marginTop: '8px'}}>当前钱包：{address?.slice(0, 8)}...{address?.slice(-6)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="admin-header">
        <Link href="/" className="back-link">← 返回主页</Link>
        <h1 className="h1">🔧 管理面板</h1>
      </div>

      <div className="card">
        <div className="h2">📊 当前配置（只读）</div>
        <div className="config-grid">
          <div className="config-item">
            <div className="config-label">合约地址</div>
            <div className="config-value">{CONTRACT_ADDRESS}</div>
          </div>
          <div className="config-item">
            <div className="config-label">开发者钱包</div>
            <div className="config-value">{devWallet as string}</div>
          </div>
          <div className="config-item">
            <div className="config-label">入场费</div>
            <div className="config-value">{entranceFee ? Number(formatUnits(entranceFee as bigint, 18)).toFixed(4) : '0'} tBNB</div>
          </div>
          <div className="config-item">
            <div className="config-label">开发者入场费率</div>
            <div className="config-value">{devEntryBps ? Number(devEntryBps) / 100 : 0}%</div>
          </div>
          <div className="config-item">
            <div className="config-label">推荐奖励费率</div>
            <div className="config-value">{referralBps ? Number(referralBps) / 100 : 0}%</div>
          </div>
          <div className="config-item">
            <div className="config-label">开发者获胜费率</div>
            <div className="config-value">{winFeeBps ? Number(winFeeBps) / 100 : 0}%</div>
          </div>
          <div className="config-item">
            <div className="config-label">当前轮次时长</div>
            <div className="config-value">{currentRoundDuration ? Number(currentRoundDuration) / 60 : 0} 分钟</div>
          </div>
          <div className="config-item">
            <div className="config-label">当前奖池</div>
            <div className="config-value">{pot ? Number(formatUnits(pot as bigint, 18)).toFixed(4) : '0'} tBNB</div>
          </div>
          <div className="config-item">
            <div className="config-label">轮次状态</div>
            <div className="config-value">{roundActive ? '🟢 进行中' : '⚪ 未开始'}</div>
          </div>
        </div>
        <div className="small" style={{marginTop: '16px', color: '#64748b'}}>
          ℹ️ 注意：入场费、费率等参数在合约部署时设定，无法修改。只有轮次时长可以修改。
        </div>
      </div>

      <div className="card">
        <div className="h2">⏱️ 设置轮次时长</div>
        <div className="small" style={{marginBottom: '16px'}}>
          {roundActive ? '⚠️ 当前有进行中的轮次，修改将在下一轮生效' : '✅ 当前无进行中的轮次，修改将立即生效'}
        </div>
        <div className="admin-form">
          <input
            type="number"
            className="input"
            placeholder="输入秒数（最少 60 秒）"
            value={roundDuration}
            onChange={(e) => setRoundDuration(e.target.value)}
          />
          <button
            className="btn btn-large"
            onClick={handleSetRoundDuration}
            disabled={isWriting || !roundDuration}
          >
            {isWriting ? '处理中...' : '设置时长'}
          </button>
        </div>
        <div className="small">当前设置：{currentRoundDuration ? Number(currentRoundDuration) : 0} 秒 ({currentRoundDuration ? Number(currentRoundDuration) / 60 : 0} 分钟)</div>
      </div>

      <div className="card">
        <div className="h2">💰 添加奖池奖励</div>
        <div className="small" style={{marginBottom: '16px'}}>向奖池中添加额外的奖励资金</div>
        <div className="admin-form">
          <input
            type="number"
            step="0.001"
            className="input"
            placeholder="输入 tBNB 数量"
            value={addRewardAmount}
            onChange={(e) => setAddRewardAmount(e.target.value)}
          />
          <button
            className="btn btn-primary btn-large"
            onClick={handleAddReward}
            disabled={isWriting || !addRewardAmount}
          >
            {isWriting ? '处理中...' : '添加奖励'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="h2">💵 设置开发者入场费率</div>
        <div className="small" style={{marginBottom: '16px'}}>
          {roundActive ? '⚠️ 当前有进行中的轮次，修改将在下一轮生效' : '✅ 当前无进行中的轮次，修改将立即生效'}
        </div>
        <div className="admin-form">
          <input
            type="number"
            step="0.1"
            className="input"
            placeholder="输入百分比（例如 10 代表 10%）"
            value={devEntryBpsInput}
            onChange={(e) => setDevEntryBpsInput(e.target.value)}
          />
          <button
            className="btn btn-large"
            onClick={handleSetDevEntryBps}
            disabled={isWriting || !devEntryBpsInput}
          >
            {isWriting ? '处理中...' : '设置费率'}
          </button>
        </div>
        <div className="small">当前设置：{devEntryBps ? Number(devEntryBps) / 100 : 0}%</div>
      </div>

      <div className="card">
        <div className="h2">🎁 设置推荐奖励费率</div>
        <div className="small" style={{marginBottom: '16px'}}>
          {roundActive ? '⚠️ 当前有进行中的轮次，修改将在下一轮生效' : '✅ 当前无进行中的轮次，修改将立即生效'}
        </div>
        <div className="admin-form">
          <input
            type="number"
            step="0.1"
            className="input"
            placeholder="输入百分比（例如 5 代表 5%）"
            value={referralBpsInput}
            onChange={(e) => setReferralBpsInput(e.target.value)}
          />
          <button
            className="btn btn-large"
            onClick={handleSetReferralBps}
            disabled={isWriting || !referralBpsInput}
          >
            {isWriting ? '处理中...' : '设置费率'}
          </button>
        </div>
        <div className="small">当前设置：{referralBps ? Number(referralBps) / 100 : 0}%</div>
      </div>

      <div className="card">
        <div className="h2">🏆 设置开发者获胜费率</div>
        <div className="small" style={{marginBottom: '16px'}}>
          {roundActive ? '⚠️ 当前有进行中的轮次，修改将在下一轮生效' : '✅ 当前无进行中的轮次，修改将立即生效'}
        </div>
        <div className="admin-form">
          <input
            type="number"
            step="0.1"
            className="input"
            placeholder="输入百分比（例如 5 代表 5%）"
            value={winFeeBpsInput}
            onChange={(e) => setWinFeeBpsInput(e.target.value)}
          />
          <button
            className="btn btn-large"
            onClick={handleSetWinFeeBps}
            disabled={isWriting || !winFeeBpsInput}
          >
            {isWriting ? '处理中...' : '设置费率'}
          </button>
        </div>
        <div className="small">当前设置：{winFeeBps ? Number(winFeeBps) / 100 : 0}%</div>
      </div>
    </div>
  )
}
