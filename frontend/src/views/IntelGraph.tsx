import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import * as d3 from 'd3'
import { Cpu, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  capital_weight: number
  company_count: number
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  weight: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export default function IntelGraph() {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<GraphNode | null>(null)

  useEffect(() => {
    axios.get('/api/intel/technologies/graph')
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load tech graph.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600
    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (e) => g.attr('transform', e.transform))
    svg.call(zoom)

    const maxCap = data.nodes.reduce((m, n) => Math.max(m, n.capital_weight), 1)
    const r = d3.scaleSqrt().domain([0, maxCap]).range([6, 28])
    const maxEdge = data.edges.reduce((m, e) => Math.max(m, e.weight), 1)
    const strokeW = d3.scaleLinear().domain([1, maxEdge]).range([1, 5])

    const DOMAIN_COLORS = ['#34d399','#a78bfa','#38bdf8','#fb7185','#f59e0b','#6ee7b7','#c084fc']
    const domainColor = d3.scaleOrdinal<string>().range(DOMAIN_COLORS)

    const simulation = d3.forceSimulation<GraphNode>(data.nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(data.edges).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius((d) => r(d.capital_weight) + 6))

    const link = g.append('g').selectAll('line').data(data.edges).join('line')
      .attr('stroke', '#3f3f46').attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d) => strokeW(d.weight))

    const node = g.append('g').selectAll('circle').data(data.nodes).join('circle')
      .attr('r', (d) => r(d.capital_weight))
      .attr('fill', (d) => domainColor(d.label.split(' ')[0]))
      .attr('fill-opacity', 0.8)
      .attr('stroke', '#78716c').attr('stroke-width', 1)
      .attr('cursor', 'pointer')
      .call((d3.drag<SVGCircleElement, GraphNode>()
        .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
      ) as any)

    node.on('mouseover', (_e, d) => {
      setHovered(d)
      node.attr('fill-opacity', (n) => n.id === d.id ? 1 : 0.2)
      link.attr('stroke-opacity', (e: any) => {
        const src = typeof e.source === 'object' ? (e.source as GraphNode).id : e.source
        const tgt = typeof e.target === 'object' ? (e.target as GraphNode).id : e.target
        return (src === d.id || tgt === d.id) ? 0.9 : 0.05
      })
    }).on('mouseout', () => {
      setHovered(null)
      node.attr('fill-opacity', 0.8)
      link.attr('stroke-opacity', 0.5)
    })

    const label = g.append('g').selectAll('text').data(data.nodes.filter((n) => n.company_count >= 2))
      .join('text').text((d) => d.label)
      .attr('font-size', 9).attr('fill', '#a1a1aa').attr('dy', -10).attr('text-anchor', 'middle')

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => { simulation.stop(); svg.on('.zoom', null) }
  }, [data])

  function formatCap(n: number): string {
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}B`
    if (n >= 1) return `$${n.toFixed(0)}M`
    return '<$1M'
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50 flex items-center gap-2">
            <Cpu size={18} className="text-amber-400" strokeWidth={1.5} />
            Primitive Co-occurrence Graph
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Node size = capital weight · Edges = companies using both primitives
          </p>
        </div>
        <button onClick={() => navigate('/intel')} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <ArrowLeft size={12} /> Queue
        </button>
      </div>

      <div className="flex-1 px-6 pb-6 relative">
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> :
          !data || data.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-64 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-zinc-500 text-sm">No graph data yet — analyze some companies first.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-[600px] relative">
              <svg ref={svgRef} width="100%" height="100%" />
              {hovered && (
                <div className="absolute top-4 right-4 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-xs min-w-[160px]">
                  <div className="text-zinc-100 font-semibold mb-1">{hovered.label}</div>
                  <div className="text-zinc-400">Companies: <span className="text-emerald-400">{hovered.company_count}</span></div>
                  <div className="text-zinc-400">Capital: <span className="text-emerald-400">{formatCap(hovered.capital_weight)}</span></div>
                </div>
              )}
            </div>
          )
        }
      </div>
    </div>
  )
}
