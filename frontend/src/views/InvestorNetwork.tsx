import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import * as d3 from 'd3'
import { Network } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface Node extends d3.SimulationNodeDatum {
  id: string
  deal_count: number
  total_capital_usd: number
}

interface Edge {
  source: string | Node
  target: string | Node
  weight: number
}

interface NetworkData {
  nodes: Node[]
  edges: Edge[]
}

const PERIODS = ['weekly', 'monthly', 'quarterly'] as const

export default function InvestorNetwork() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<NetworkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly')

  useEffect(() => {
    setLoading(true)
    setError(null)
    axios
      .get('/api/investors/network', { params: { period, min_deals: 1 } })
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load investor network.'))
      .finally(() => setLoading(false))
  }, [period])

  useEffect(() => {
    if (!data || !svgRef.current) return
    if (data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
      g.attr('transform', event.transform)
    })
    svg.call(zoom)

    const maxDeals = d3.max(data.nodes, (n) => n.deal_count) || 1
    const r = d3.scaleSqrt().domain([1, maxDeals]).range([5, 20])

    const maxWeight = d3.max(data.edges, (e) => e.weight) || 1
    const strokeW = d3.scaleLinear().domain([1, maxWeight]).range([1, 4])

    // Quartile computation for node coloring
    const sortedCounts = [...data.nodes].sort((a, b) => a.deal_count - b.deal_count)
    const q1 = sortedCounts[Math.floor(sortedCounts.length * 0.25)]?.deal_count ?? 1
    const q3 = sortedCounts[Math.floor(sortedCounts.length * 0.75)]?.deal_count ?? 1

    function nodeColor(deal_count: number): string {
      if (deal_count >= q3) return '#34d399'  // emerald-400 — high
      if (deal_count >= q1) return '#f59e0b'  // amber-400 — mid
      return '#52525b'                         // zinc-600 — low
    }

    const simulation = d3
      .forceSimulation(data.nodes)
      .force('link', d3.forceLink<Node, Edge>(data.edges).id((d) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<Node>().radius((d) => r(d.deal_count) + 4))

    const link = g
      .append('g')
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('stroke', (d) => d.weight >= 3 ? '#f59e0b' : '#3f3f46')
      .attr('stroke-opacity', (d) => d.weight >= 3 ? 0.6 : 0.4)
      .attr('stroke-width', (d) => strokeW(d.weight))

    const node = g
      .append('g')
      .selectAll('circle')
      .data(data.nodes)
      .join('circle')
      .attr('r', (d) => r(d.deal_count))
      .attr('fill', (d) => nodeColor(d.deal_count))
      .attr('fill-opacity', 0.8)
      .attr('stroke', '#78716c')
      .attr('stroke-width', 1)
      .call(
        (d3
          .drag<SVGCircleElement, Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })) as any
      )

    // Focus mode on node hover
    node
      .on('mouseover', (_event, d) => {
        link.attr('stroke-opacity', (e: any) => {
          const src = typeof e.source === 'object' ? (e.source as any).id : e.source
          const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target
          return (src === d.id || tgt === d.id) ? 0.8 : 0.05
        })
        node.attr('fill-opacity', (n) => {
          if (n.id === d.id) return 1
          const connected = data.edges.some((e) => {
            const src = typeof e.source === 'object' ? (e.source as any).id : e.source
            const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target
            return (src === d.id && tgt === n.id) || (tgt === d.id && src === n.id)
          })
          return connected ? 0.9 : 0.15
        })
      })
      .on('mouseout', () => {
        link.attr('stroke-opacity', (d: any) => d.weight >= 3 ? 0.6 : 0.4)
        node.attr('fill-opacity', 0.8)
      })

    const label = g
      .append('g')
      .selectAll('text')
      .data(data.nodes.filter((n) => n.deal_count >= 2))
      .join('text')
      .text((d) => d.id)
      .attr('font-size', 10)
      .attr('fill', '#a1a1aa')
      .attr('dy', -8)
      .attr('text-anchor', 'middle')

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)

      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => {
      simulation.stop()
      svg.on('.zoom', null)
    }
  }, [data])

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Network size={18} className="text-amber-400" strokeWidth={1.5} />
            Investor Network
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Co-investment relationships — node size = deal count
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-3 py-1.5 rounded font-mono transition-colors ${
                period === p
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-slate-500 hover:text-slate-700 border border-slate-200'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-6">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorBanner message={error} />
        ) : !data || data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-64 bg-white border border-slate-200 shadow-sm rounded-lg">
            <p className="text-slate-500 text-sm">No co-investment data for this period.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden h-[600px]">
            <svg ref={svgRef} width="100%" height="100%" />
          </div>
        )}
      </div>
    </div>
  )
}
