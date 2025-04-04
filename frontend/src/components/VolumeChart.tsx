'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

interface VolumeChartProps {
  symbol: string;
  timeframe?: '5d' | '1m' | '3m' | '6m' | '1y' | 'ytd';
}

interface VolumeData {
  timestamp: string;
  volume: number;
  price: number;
}

export function VolumeChart({ symbol, timeframe = '1y' }: VolumeChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<VolumeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(timeframe);

  useEffect(() => {
    if (!symbol) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await axios.get(`http://3.148.170.36:3002/stock-market/daily?symbol=${symbol}`, {
          timeout: 15000
        });

        if (!response.data || !Array.isArray(response.data)) {
          throw new Error('Invalid data format received from API');
        }

        const transformedData = response.data.map((item: any) => ({
          timestamp: item.timestamp,
          volume: item.volume,
          price: item.close
        }));

        transformedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setData(transformedData);
      } catch (err) {
        console.warn(`Error fetching volume data for ${symbol}:`, err instanceof Error ? err.message : String(err));
        setError("Using mock data - backend API unavailable");
        // Generate mock data logic...
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);

  const getFilteredData = (allData: VolumeData[], tf: string) => {
    if (!allData.length) return [];

    const now = new Date();
    let startDate = new Date();

    if (tf === '5d') {
      startDate.setDate(now.getDate() - 5);
    } else if (tf === '1m') {
      startDate.setMonth(now.getMonth() - 1);
    } else if (tf === '3m') {
      startDate.setMonth(now.getMonth() - 3);
    } else if (tf === '6m') {
      startDate.setMonth(now.getMonth() - 6);
    } else if (tf === '1y') {
      startDate.setFullYear(now.getFullYear() - 1);
    } else { // ytd
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    return allData.filter(d => new Date(d.timestamp) >= startDate);
  };

  useEffect(() => {
    if (!data.length || !svgRef.current) return;

    if (!tooltipRef.current) {
      tooltipRef.current = document.createElement('div');
      tooltipRef.current.className = 'tooltip';
      tooltipRef.current.style.position = 'absolute';
      tooltipRef.current.style.padding = '8px';
      tooltipRef.current.style.background = 'rgba(0, 0, 0, 0.7)';
      tooltipRef.current.style.color = 'white';
      tooltipRef.current.style.borderRadius = '4px';
      tooltipRef.current.style.fontSize = '12px';
      tooltipRef.current.style.pointerEvents = 'none';
      tooltipRef.current.style.opacity = '0';
      tooltipRef.current.style.zIndex = '1000';
      document.body.appendChild(tooltipRef.current);
    }

    d3.select(svgRef.current).selectAll("*").remove();
    const filteredData = getFilteredData(data, selectedTimeframe);

    if (filteredData.length === 0) {
      return; // No data to display
    }

    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleTime()
      .domain(d3.extent(filteredData, d => new Date(d.timestamp)) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(filteredData, d => d.volume) as number * 1.1])
      .range([height, 0]);

    // Calculate moving average (5-day)
    const movingAverage = (data: VolumeData[], windowSize: number) => {
      const result = [];
      for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
          continue;
        }

        let sum = 0;
        for (let j = 0; j < windowSize; j++) {
          sum += data[i - j].volume;
        }

        result.push({
          timestamp: data[i].timestamp,
          volume: sum / windowSize
        });
      }
      return result;
    };

    const maData = movingAverage(filteredData, 5);

    // Add x-axis
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale)
        .tickFormat((d) => {
          const date = new Date(d as Date);
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }));

    // Add y-axis
    svg.append("g")
      .call(d3.axisLeft(yScale)
        .tickFormat((d: any) => {
          if (d >= 1000000) return `${(d / 1000000).toFixed(1)}M`;
          if (d >= 1000) return `${(d / 1000).toFixed(1)}k`;
          return `${d}`;
        }));

    function formatNumber(number) {
      if (number >= 1000000) {
          return (number / 1000000).toFixed(2) + 'M';
      } else if (number >= 1000) {
          return (number / 1000).toFixed(2) + 'K';
      } else {
          return number.toString();
      }
    }

    // Add volume bars
    svg.selectAll(".bar")
      .data(filteredData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(new Date(d.timestamp)))
      .attr("width", width / filteredData.length * 0.8)
      .attr("y", d => yScale(d.volume))
      .attr("height", d => height - yScale(d.volume))
      .attr("fill", d => {
        const avgVolume = d3.mean(filteredData, d => d.volume) as number;
        if (d.volume > avgVolume * 1.5) return "#d62728"; // High volume
        if (d.volume > avgVolume) return "#ff9896"; // Above average
        return "#98df8a"; // Normal or below average
      })
      .on("mouseover", function(event, d) {
        const x = xScale(new Date(d.timestamp));
        const y = yScale(d.volume);
        const maValue = maData.find(ma => ma.timestamp === d.timestamp)?.volume || 0;
    
        tooltipRef.current!.style.opacity = '0.9';
        tooltipRef.current!.style.left = (event.pageX + 10) + "px";
        tooltipRef.current!.style.top = (event.pageY - 30) + "px";
        tooltipRef.current!.innerHTML = `
          <div><strong>${symbol}</strong>: ${new Date(d.timestamp).toLocaleDateString()}</div>
          <div>Volume: ${formatNumber(d.volume)}</div>
          <div>5-Day Moving Average: ${formatNumber(maValue)}</div>
        `;
    })
      .on("mouseout", function() {
        tooltipRef.current!.style.opacity = '0';
      });

    // Add moving average line
    const line = d3.line<any>()
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d.volume))
      .curve(d3.curveBasis);

    svg.append("path")
      .datum(maData)
      .attr("fill", "none")
      .attr("stroke", "#1f77b4")
      .attr("stroke-width", 1.5)
      .attr("d", line);

    // Timeframe selector
    const timeframeOptions = ['5d', '1m', '3m', '6m', '1y', 'ytd'];
    const timeframeContainer = svg.append("g")
      .attr("transform", `translate(0, ${height + 30})`);

    timeframeContainer.append("text")
      .attr("x", 0)
      .attr("y", 0)
      .text("Select Timeframe: ");

    const buttonWidth = 40;
    const buttonSpacing = 10;
    const buttonStartX = 150;

    timeframeContainer.selectAll(".timeframe-btn")
      .data(timeframeOptions)
      .enter()
      .append("text")
      .attr("class", "timeframe-btn")
      .attr("x", (d, i) => buttonStartX + i * (buttonWidth + buttonSpacing))
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .attr("cursor", "pointer")
      .style("font-size", "12px")
      .style("font-weight", d => d === selectedTimeframe ? "bold" : "normal")
      .text(d => d)
      .on("click", function(event, d) {
        setSelectedTimeframe(d as any);
      });

  }, [data, symbol, selectedTimeframe]);

  if (loading) {
    return <div className="h-full flex items-center justify-center">Loading volume data...</div>;
  }

  if (error && !data.length) {
    return <div className="h-full flex items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <div className="h-full relative">
      {error && (
        <div className="absolute top-2 right-2 bg-amber-100 text-amber-800 text-xs p-1 rounded">
          {error}
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
}