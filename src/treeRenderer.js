document.addEventListener('DOMContentLoaded', () => {
    // Retrieve the project structure
    const projectTree = window.projectStructure;
    if (!projectTree) {
        console.error("No project structure found.");
        return;
    }

    const svg = d3.select('svg');
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr('width', width).attr('height', height);

    const margin = { top: 50, right: 50, bottom: 50, left: 50 },
          innerWidth = width - margin.left - margin.right,
          innerHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Function for pan and zoom
    const zoom = d3.zoom()
        .scaleExtent([0.5, 5])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });
    svg.call(zoom);

    // Create the tree hierarchy
    const root = d3.hierarchy(projectTree);

    // Tree layout with fixed distance between nodes
    const treeLayout = d3.tree()
        .nodeSize([180, 100]); // Increase vertical distance between nodes
    treeLayout(root);

    // Connect nodes with lines
    g.selectAll('.link')
        .data(root.links())
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
        .attr('stroke', '#999')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.6);

    // Nodes
    const node = g.selectAll('.node')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`);

    // Fixed padding in px
    const paddingX = 20;
    const rectHeight = 40;

    // Add text
    node.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 5)
        .attr('fill', '#fff') 
        .style('font-family', 'sans-serif')
        .style('font-size', '14px')
        .style('pointer-events', 'none')
        .text(d => d.data.name)
        .each(function(d) {
            const textWidth = this.getComputedTextLength();
            d.rectWidth = textWidth + paddingX * 2; // Calculate rectangle width based on text
        });

    // Background rectangle based on measured text width
    node.insert('rect', 'text')
        .attr('x', d => -d.rectWidth / 2)
        .attr('y', -rectHeight / 2)
        .attr('width', d => d.rectWidth)
        .attr('height', rectHeight)
        .attr('rx', 8)
        .attr('ry', 8)
        .attr('fill', d => d.data.isDirectory ? '#69b3a2' : '#1a635d')
        .attr('stroke', '#333')
        .attr('stroke-width', 1);
});