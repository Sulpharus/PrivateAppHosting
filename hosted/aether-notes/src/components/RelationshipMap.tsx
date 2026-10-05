/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as d3 from 'd3';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import type { Person } from '../types';

interface RelationshipMapProps {
  people: Person[];
  onAddConnection: (id1: string, id2: string, type: string, description?: string) => void;
  onRemoveConnection: (id1: string, id2: string) => void;
  onSelectPerson: (person: Person) => void;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  avatarUrl?: string;
  initials?: string;
  category: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  description?: string;
}

export default function RelationshipMap({
  people,
  onAddConnection,
  onRemoveConnection,
  onSelectPerson,
}: RelationshipMapProps) {
  const { language } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Graph customizability state (like Obsidian)
  const [repulsionStrength, setRepulsionStrength] = useState<number>(-240);
  const [linkDistance, setLinkDistance] = useState<number>(100);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Connection Form State
  const [person1Id, setPerson1Id] = useState<string>('');
  const [person2Id, setPerson2Id] = useState<string>('');
  const [connectionType, setConnectionType] = useState<string>('Friend');
  const [customType, setCustomType] = useState<string>('');
  const [connectionDesc, setConnectionDesc] = useState<string>('');

  const connectionTypeOptions = [
    { value: 'Friend', label_en: 'Friend', label_de: 'Freund/in' },
    { value: 'Colleague', label_en: 'Colleague', label_de: 'Kollege/Kollegin' },
    { value: 'Family', label_en: 'Family', label_de: 'Familie' },
    { value: 'Mentor', label_en: 'Mentor', label_de: 'Mentor/in' },
    { value: 'Partner', label_en: 'Partner', label_de: 'Partner/in' },
    { value: 'Custom', label_en: 'Custom Type...', label_de: 'Eigener Typ...' },
  ];

  // Colors based on category
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Family':
        return '#f43f5e'; // rose-500
      case 'Friends':
        return '#10b981'; // emerald-500
      case 'Colleagues':
        return '#3b82f6'; // blue-500
      default:
        return '#8b5cf6'; // violet-500
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Prepare D3 Graph Data
  const graphData = useMemo(() => {
    // 1. Define nodes
    const nodes: GraphNode[] = people.map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      initials: p.initials || getInitials(p.name),
      category: p.category,
    }));

    // 2. Define links (avoid duplicates by checking source < target)
    const links: GraphLink[] = [];
    const seenLinks = new Set<string>();

    people.forEach((p) => {
      if (p.connections) {
        p.connections.forEach((conn) => {
          const pairKey = [p.id, conn.targetId].sort().join(':::');
          if (!seenLinks.has(pairKey)) {
            seenLinks.add(pairKey);
            // Verify target actually exists
            if (people.some((other) => other.id === conn.targetId)) {
              links.push({
                id: `${p.id}-${conn.targetId}`,
                source: p.id,
                target: conn.targetId,
                type: conn.type,
                description: conn.description,
              });
            }
          }
        });
      }
    });

    return { nodes, links };
  }, [people]);

  // Handle D3 initialization & physics
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous rendering

    const width = svgRef.current.clientWidth || 600;
    const height = svgRef.current.clientHeight || 500;

    // Deep copy graph data to let D3 mutate x, y, vx, vy
    const nodesData: GraphNode[] = JSON.parse(JSON.stringify(graphData.nodes));
    const linksData: GraphLink[] = JSON.parse(JSON.stringify(graphData.links));

    // Defs for circular avatar patterns
    const defs = svg.append('defs');
    nodesData.forEach((node) => {
      if (node.avatarUrl) {
        defs
          .append('pattern')
          .attr('id', `avatar-pattern-${node.id}`)
          .attr('width', 1)
          .attr('height', 1)
          .attr('patternContentUnits', 'objectBoundingBox')
          .append('image')
          .attr('href', node.avatarUrl)
          .attr('width', 1)
          .attr('height', 1)
          .attr('preserveAspectRatio', 'xMidYMid slice');
      }
    });

    // Create container group for zoom/pan
    const gContainer = svg.append('g').attr('class', 'graph-container');

    // Subtle background grid
    const gridPattern = defs
      .append('pattern')
      .attr('id', 'graph-grid')
      .attr('width', 40)
      .attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse');

    gridPattern
      .append('path')
      .attr('d', 'M 40 0 L 0 0 0 40')
      .attr('fill', 'none')
      .attr('stroke', 'currentColor')
      .attr('class', 'text-outline-variant/10 dark:text-outline-variant/5')
      .attr('stroke-width', 1);

    gContainer
      .append('rect')
      .attr('width', width * 4)
      .attr('height', height * 4)
      .attr('x', -width * 2)
      .attr('y', -height * 2)
      .attr('fill', 'url(#graph-grid)')
      .lower();

    // D3 Force Simulation setup
    const simulation = d3
      .forceSimulation<GraphNode>(nodesData)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(linksData)
          .id((d) => d.id)
          .distance(linkDistance),
      )
      .force('charge', d3.forceManyBody().strength(repulsionStrength))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(40));

    // ZOOM & PAN HANDLERS
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => {
        gContainer.attr('transform', event.transform);
      });

    svg.call(zoomBehavior);

    // Zoom buttons listeners helper
    svg.datum({ zoomBehavior });

    // DRAW LINKS
    const link = gContainer
      .append('g')
      .attr('class', 'links')
      .selectAll('g')
      .data(linksData)
      .join('g')
      .attr('class', 'link-group');

    const linkLine = link
      .append('line')
      .attr('stroke', 'currentColor')
      .attr('class', 'text-on-surface-variant/20 dark:text-on-surface-variant/15 transition-all')
      .attr('stroke-width', 2);

    // Optional link type labels
    const linkLabel = link
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .attr(
        'class',
        'fill-on-surface-variant/50 text-[8px] font-mono select-none pointer-events-none transition-opacity',
      )
      .style('opacity', showLabels ? 0.6 : 0)
      .text((d) => d.type);

    // DRAW NODES
    const node = gContainer
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodesData)
      .join('g')
      .attr('class', 'node-group cursor-pointer')
      .call(drag(simulation));

    // Outer Glow / Ring Circle
    const outerRing = node
      .append('circle')
      .attr('r', 22)
      .attr('fill', 'none')
      .attr('stroke', (d) => getCategoryColor(d.category))
      .attr('stroke-width', 2.5)
      .attr('class', 'transition-all duration-300 opacity-80 group-hover:opacity-100');

    // Fill Circle (Image or solid)
    const innerCircle = node
      .append('circle')
      .attr('r', 19)
      .attr('fill', (d) => (d.avatarUrl ? `url(#avatar-pattern-${d.id})` : '#f1f5f9'))
      .attr('class', 'dark:fill-surface-container-high transition-transform');

    // Fallback Initials (only rendered if no avatarUrl)
    node
      .filter((d) => !d.avatarUrl)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.33em')
      .attr(
        'class',
        'fill-primary font-sans font-extrabold text-[10px] select-none pointer-events-none',
      )
      .text((d) => d.initials || '??');

    // Hover tooltip/card indicator
    node.append('title').text((d) => `${d.name} (${d.category})`);

    // Node labels (Names)
    const label = node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 34)
      .attr(
        'class',
        'fill-on-surface font-sans text-[10px] font-bold select-none pointer-events-none',
      )
      .style('text-shadow', '0 1px 2px rgba(var(--color-surface-bright), 0.8)')
      .text((d) => d.name);

    // HOVER INTERACTIONS (Obsidian Graph-like highlighting)
    node.on('mouseenter', function (event, d) {
      // Scale up current node ring
      d3.select(this).select('circle:nth-child(2)').transition().duration(200).attr('r', 22);
      d3.select(this)
        .select('circle:first-child')
        .transition()
        .duration(200)
        .attr('r', 25)
        .attr('stroke-width', 3.5);

      // Find adjacent node ids
      const linkedNodeIds = new Set<string>();
      linkedNodeIds.add(d.id);

      linksData.forEach((l) => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        if (sourceId === d.id) {
          linkedNodeIds.add(targetId);
        } else if (targetId === d.id) {
          linkedNodeIds.add(sourceId);
        }
      });

      // Dim all other nodes
      node
        .transition()
        .duration(200)
        .style('opacity', (n) => (linkedNodeIds.has(n.id) ? 1.0 : 0.15));

      // Highlight active links, hide others
      linkLine
        .transition()
        .duration(200)
        .attr('stroke', (l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return sourceId === d.id || targetId === d.id
            ? getCategoryColor(d.category)
            : 'currentColor';
        })
        .attr('stroke-width', (l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return sourceId === d.id || targetId === d.id ? 3.5 : 1;
        })
        .style('opacity', (l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return sourceId === d.id || targetId === d.id ? 0.9 : 0.05;
        });

      linkLabel
        .transition()
        .duration(200)
        .style('opacity', (l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return sourceId === d.id || targetId === d.id ? 1.0 : 0.02;
        });
    });

    node.on('mouseleave', function () {
      // Reset current node sizes
      d3.select(this).select('circle:nth-child(2)').transition().duration(200).attr('r', 19);
      d3.select(this)
        .select('circle:first-child')
        .transition()
        .duration(200)
        .attr('r', 22)
        .attr('stroke-width', 2.5);

      // Restore all
      node.transition().duration(200).style('opacity', 1.0);
      linkLine
        .transition()
        .duration(200)
        .attr('stroke', 'currentColor')
        .attr('stroke-width', 2)
        .style('opacity', 1.0);
      linkLabel
        .transition()
        .duration(200)
        .style('opacity', showLabels ? 0.6 : 0);
    });

    // CLICK HANDLER: Trigger Inspector Modal
    node.on('click', (event, d) => {
      const realPersonObj = people.find((p) => p.id === d.id);
      if (realPersonObj) {
        onSelectPerson(realPersonObj);
      }
    });

    // SEARCH HIGHLIGHTING
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      node.each(function (n) {
        const match = n.name.toLowerCase().includes(q) || n.category.toLowerCase().includes(q);
        d3.select(this)
          .transition()
          .duration(250)
          .style('opacity', match ? 1.0 : 0.15);
      });
      linkLine.transition().duration(250).style('opacity', 0.05);
      linkLabel.transition().duration(250).style('opacity', 0);
    }

    // UPDATE PHYSICS ON TIMESTEP TICK
    simulation.on('tick', () => {
      linkLine
        .attr('x1', (d) => (d.source as GraphNode).x || 0)
        .attr('y1', (d) => (d.source as GraphNode).y || 0)
        .attr('x2', (d) => (d.target as GraphNode).x || 0)
        .attr('y2', (d) => (d.target as GraphNode).y || 0);

      linkLabel
        .attr('x', (d) => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          return ((s.x || 0) + (t.x || 0)) / 2;
        })
        .attr('y', (d) => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          return ((s.y || 0) + (t.y || 0)) / 2;
        });

      node.attr('transform', (d) => `translate(${d.x || 0}, ${d.y || 0})`);
    });

    // Drag-drop implementation
    function drag(sim: d3.Simulation<GraphNode, GraphLink>) {
      function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
        if (!event.active) sim.alphaTarget(0.2).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
        if (!event.active) sim.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3
        .drag<SVGGElement, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }

    // Handle resizing
    const handleResize = () => {
      if (!svgRef.current) return;
      const w = svgRef.current.clientWidth;
      const h = svgRef.current.clientHeight;
      simulation.force('center', d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.1).restart();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      simulation.stop();
      window.removeEventListener('resize', handleResize);
    };
  }, [graphData, repulsionStrength, linkDistance, showLabels, searchQuery, people]);

  // Zoom control buttons
  const handleZoom = (factor: number) => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const data = svg.datum() as
      | { zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> }
      | undefined;
    if (data && data.zoomBehavior) {
      if (factor === 0) {
        svg.transition().duration(400).call(data.zoomBehavior.transform, d3.zoomIdentity);
      } else {
        svg.transition().duration(400).call(data.zoomBehavior.scaleBy, factor);
      }
    }
  };

  // Connect form submit
  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!person1Id || !person2Id) return;
    if (person1Id === person2Id) {
      alert(
        language === 'de'
          ? 'Eine Person kann sich nicht mit sich selbst verbinden!'
          : 'A person cannot connect with themselves!',
      );
      return;
    }

    const finalType =
      connectionType === 'Custom' ? customType.trim() || 'Connection' : connectionType;
    onAddConnection(person1Id, person2Id, finalType, connectionDesc.trim() || undefined);

    // Clear connection form
    setPerson2Id('');
    setCustomType('');
    setConnectionDesc('');
  };

  // Autocomplete suggestions
  const remainingTargetPeople = useMemo(() => {
    if (!person1Id) return [];
    const sourcePerson = people.find((p) => p.id === person1Id);
    if (!sourcePerson) return [];

    // Return people that are not person1 and not already connected to person1
    const connectedIds = sourcePerson.connections?.map((c) => c.targetId) || [];
    return people.filter((p) => p.id !== person1Id && !connectedIds.includes(p.id));
  }, [person1Id, people]);

  useEffect(() => {
    // Pick defaults
    if (people.length >= 2) {
      if (!person1Id) setPerson1Id(people[0].id);
    }
  }, [people, person1Id]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in select-none">
      {/* LEFT PANEL: Obsidian-like Customizer & Connector */}
      <div className="lg:col-span-1 space-y-6 flex flex-col justify-between">
        {/* GRAPH CUSTOMIZATIONS */}
        <div className="bg-surface-container-low border border-outline-variant/15 p-5 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <span className="material-symbols-outlined text-primary text-lg">settings_suggest</span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface">
              {language === 'de' ? 'Graph-Anpassung' : 'Graph Settings'}
            </h4>
          </div>

          {/* Search box */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              {language === 'de' ? 'Suche im Graph' : 'Search Node'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  language === 'de' ? 'z.B. Julia, Familie...' : 'e.g. Julia, Colleagues...'
                }
                className="w-full bg-surface-bright border border-outline-variant/20 pl-8 pr-3 py-1.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
              />
              <span className="material-symbols-outlined text-sm text-on-surface-variant/45 absolute left-2.5 top-2.5">
                search
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-on-surface-variant hover:text-on-surface cursor-pointer select-none"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Charge / Gravity repulsion */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              <span>{language === 'de' ? 'Knotenabstoßung' : 'Node Repulsion'}</span>
              <span className="font-mono text-primary">{Math.abs(repulsionStrength)}</span>
            </div>
            <input
              type="range"
              min="100"
              max="600"
              step="20"
              value={Math.abs(repulsionStrength)}
              onChange={(e) => setRepulsionStrength(-Number(e.target.value))}
              className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          {/* Link distance */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              <span>{language === 'de' ? 'Verbindungsdistanz' : 'Link Distance'}</span>
              <span className="font-mono text-primary">{linkDistance}px</span>
            </div>
            <input
              type="range"
              min="60"
              max="200"
              step="10"
              value={linkDistance}
              onChange={(e) => setLinkDistance(Number(e.target.value))}
              className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          {/* Toggle Labels */}
          <label className="flex items-center gap-2.5 text-xs text-on-surface-variant font-medium select-none cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-4 h-4 rounded-md border-outline-variant text-primary focus:ring-primary/20 accent-primary cursor-pointer"
            />
            <span>
              {language === 'de' ? 'Verbindungstypen anzeigen' : 'Show Relationship Labels'}
            </span>
          </label>
        </div>

        {/* QUICK LINK CONNECTOR FORM */}
        <div className="bg-surface-container-low border border-outline-variant/15 p-5 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <span className="material-symbols-outlined text-primary text-lg">join_inner</span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface">
              {language === 'de' ? 'Schnelle Verbindung' : 'Link Network'}
            </h4>
          </div>

          {people.length < 2 ? (
            <p className="text-[11px] text-on-surface-variant/70 italic leading-relaxed">
              {language === 'de'
                ? 'Fügen Sie mindestens zwei Personen zu Ihrem Netzwerk hinzu, um Beziehungen zu verknüpfen.'
                : 'Please add at least two people to your network directory to establish relationship links.'}
            </p>
          ) : (
            <form onSubmit={handleConnectSubmit} className="space-y-3.5 text-xs">
              {/* Person 1 Selection */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  {language === 'de' ? 'Person 1' : 'Connect Person'}
                </label>
                <select
                  value={person1Id}
                  onChange={(e) => {
                    setPerson1Id(e.target.value);
                    setPerson2Id(''); // reset target selection
                  }}
                  className="w-full bg-surface-bright border border-outline-variant/20 px-2.5 py-1.5 rounded-xl font-sans focus:outline-primary text-on-surface"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Person 2 Selection */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  {language === 'de' ? 'Verbinden mit...' : 'With Person...'}
                </label>
                <select
                  value={person2Id}
                  onChange={(e) => setPerson2Id(e.target.value)}
                  required
                  className="w-full bg-surface-bright border border-outline-variant/20 px-2.5 py-1.5 rounded-xl font-sans focus:outline-primary text-on-surface"
                >
                  <option value="">
                    {language === 'de' ? '-- Auswählen --' : '-- Choose Person --'}
                  </option>
                  {remainingTargetPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {remainingTargetPeople.length === 0 && person1Id && (
                  <p className="text-[9px] text-primary/75 italic mt-1 font-serif">
                    {language === 'de'
                      ? 'Bereits mit allen verknüpft!'
                      : 'Already connected to everyone!'}
                  </p>
                )}
              </div>

              {/* Relationship Type selection */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  {language === 'de' ? 'Beziehungstyp' : 'Relationship Type'}
                </label>
                <select
                  value={connectionType}
                  onChange={(e) => setConnectionType(e.target.value)}
                  className="w-full bg-surface-bright border border-outline-variant/20 px-2.5 py-1.5 rounded-xl font-sans focus:outline-primary text-on-surface"
                >
                  {connectionTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {language === 'de' ? opt.label_de : opt.label_en}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom type input */}
              {connectionType === 'Custom' && (
                <div>
                  <input
                    type="text"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    required
                    placeholder={
                      language === 'de'
                        ? 'z.B. Sandkastenfreund, Koautor'
                        : 'e.g. Mentor, Co-author'
                    }
                    className="w-full bg-surface-bright border border-outline-variant/20 px-3 py-1.5 rounded-xl font-sans focus:outline-primary text-on-surface"
                  />
                </div>
              )}

              {/* Connection Description */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  {language === 'de' ? 'Details (Optional)' : 'Details (Optional)'}
                </label>
                <input
                  type="text"
                  value={connectionDesc}
                  onChange={(e) => setConnectionDesc(e.target.value)}
                  placeholder={
                    language === 'de'
                      ? 'z.B. Kennen uns seit der Uni'
                      : 'e.g. Met at Berlin design expo'
                  }
                  className="w-full bg-surface-bright border border-outline-variant/20 px-3 py-1.5 rounded-xl font-sans focus:outline-primary text-on-surface"
                />
              </div>

              <button
                type="submit"
                disabled={!person1Id || !person2Id}
                className="w-full bg-primary disabled:opacity-50 hover:bg-primary/95 text-on-primary text-xs font-bold py-2 rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">link</span>
                {language === 'de' ? 'Verbindung verknüpfen' : 'Establish Link'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* RIGHT CANVAS: SVG interactive Graph View */}
      <div className="lg:col-span-3 bg-surface-container-lowest border border-outline-variant/20 rounded-3xl p-4 flex flex-col relative min-h-[500px] lg:min-h-[620px] overflow-hidden">
        {/* Canvas overlays */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 select-none pointer-events-none">
          <h3 className="font-sans text-xs font-bold text-on-surface flex items-center gap-1.5 bg-surface-bright/70 backdrop-blur-xs p-2 rounded-xl border border-outline-variant/10 shadow-xs pointer-events-auto">
            <span
              className="material-symbols-outlined text-primary text-base"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              hub
            </span>
            {language === 'de' ? 'Interaktive Netzwerkkarte' : 'Interactive Mind Network Map'}
          </h3>
          <p className="text-[10px] text-on-surface-variant/70 italic max-w-xs leading-normal ml-1">
            {language === 'de'
              ? 'Ziehen Sie Knoten, um die Anordnung anzupassen. Bewegen Sie die Maus über einen Knoten, um nahe Verbindungen zu beleuchten. Klicken Sie, um das Profil zu öffnen.'
              : 'Drag nodes to reposition. Hover over nodes to highlight active branches. Click any node to open their companion profile.'}
          </p>
        </div>

        {/* Categories Legend Overlay */}
        <div className="absolute bottom-4 left-4 z-10 bg-surface-bright/80 backdrop-blur-xs p-3 rounded-2xl border border-outline-variant/15 shadow-xs flex flex-col gap-1.5 text-[9px] font-sans font-bold text-on-surface-variant select-none">
          <span className="text-[8px] uppercase tracking-wider text-on-surface-variant/50 border-b border-outline-variant/10 pb-1 mb-1">
            {language === 'de' ? 'Legende (Farben)' : 'Category Keys'}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: '#f43f5e' }}
            ></span>
            <span>{language === 'de' ? 'Familie' : 'Family'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: '#10b981' }}
            ></span>
            <span>{language === 'de' ? 'Freunde' : 'Friends'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: '#3b82f6' }}
            ></span>
            <span>{language === 'de' ? 'Kollegen' : 'Colleagues'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: '#8b5cf6' }}
            ></span>
            <span>{language === 'de' ? 'Andere/Eigene' : 'Custom Categories'}</span>
          </div>
        </div>

        {/* Obsidian-Style Zoom / Reset floating panel */}
        <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-1.5">
          <button
            onClick={() => handleZoom(1.3)}
            className="w-8 h-8 rounded-xl bg-surface-bright hover:bg-surface-container border border-outline-variant/15 text-on-surface-variant hover:text-on-surface shadow-xs flex items-center justify-center transition-all cursor-pointer select-none active:scale-90"
            title="Zoom In"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
          </button>
          <button
            onClick={() => handleZoom(0.7)}
            className="w-8 h-8 rounded-xl bg-surface-bright hover:bg-surface-container border border-outline-variant/15 text-on-surface-variant hover:text-on-surface shadow-xs flex items-center justify-center transition-all cursor-pointer select-none active:scale-90"
            title="Zoom Out"
          >
            <span className="material-symbols-outlined text-sm font-bold">remove</span>
          </button>
          <button
            onClick={() => handleZoom(0)}
            className="w-8 h-8 rounded-xl bg-surface-bright hover:bg-surface-container border border-outline-variant/15 text-on-surface-variant hover:text-on-surface shadow-xs flex items-center justify-center transition-all cursor-pointer select-none active:scale-90"
            title="Recenter Camera"
          >
            <span className="material-symbols-outlined text-sm font-bold">home</span>
          </button>
        </div>

        {/* Actual Canvas SVG */}
        <svg
          ref={svgRef}
          className="w-full flex-1 min-h-[460px] cursor-grab active:cursor-grabbing bg-transparent text-on-surface"
        />
      </div>
    </div>
  );
}
