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

export function VolumeChart({ symbol, timeframe = '1m' }: VolumeChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<VolumeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Try to fetch from backend API with increased timeout
        const response = await axios.get(`http://3.148.170.36:3002/stock-market/daily?symbol=${symbol}`, {
          timeout: 8000 // 8 second timeout for better success rate
        });
        
        if (!response.data || !Array.isArray(response.data)) {
          throw new Error('Invalid data format received from API');
        }
        
        // Transform the data to match our VolumeData interface
        const transformedData = response.data.map((item: any) => ({
          timestamp: item.timestamp,
          volume: item.volume,
          price: item.close // Using closing price for the volume chart
        }));
        
        // Sort by timestamp in ascending order (oldest first)
        transformedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        setData(transformedData);
      } catch (err) {
        console.warn(`Error fetching volume data for ${symbol}:`, err instanceof Error ? err.message : String(err));
        
        // Generate mock data when API is unavailable
        const mockData: VolumeData[] = [];
        const endDate = new Date();
        let startDate = new Date();
        
        // Adjust startDate based on timeframe
        if (timeframe === '5d') {
          startDate.setDate(endDate.getDate() - 5);
        } else if (timeframe === '1m') {
          startDate.setMonth(endDate.getMonth() - 1);
        } else if (timeframe === '3m') {
          startDate.setMonth(endDate.getMonth() - 3);
        } else if (timeframe === '6m') {
          startDate.setMonth(endDate.getMonth() - 6);
        } else if (timeframe === '1y') {
          startDate.setFullYear(endDate.getFullYear() - 1);
        } else { // ytd
          startDate = new Date(endDate.getFullYear(), 0, 1);
        }
        
        // Generate volume data
        const msPerDay = 24 * 60 * 60 * 1000;
        let currentDate = new Date(startDate);
        let basePrice = 100 + Math.random() * 200; // Random starting price
        
        while (currentDate <= endDate) {
          // Skip weekends
          if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
            const dailyChange = (Math.random() - 0.45) * 2; // Slight upward bias
            basePrice = basePrice * (1 + dailyChange / 100);
            
            // Generate a volume pattern that correlates somewhat with price change
            let volume = 100000 + Math.random() * 900000;
            
            // Higher volume on big price moves
            if (Math.abs(dailyChange) > 1) {
              volume *= 1.5;
            }
            
            mockData.push({
              timestamp: currentDate.toISOString(),
              volume: Math.floor(volume),
              price: basePrice
            });
          }
          
          // Move to next day
          currentDate = new Date(currentDate.getTime() + msPerDay);
        }
        
        // Sort by timestamp in ascending order (oldest first)
        mockData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        setData(mockData);
        setError("Using mock data - backend API unavailable");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [symbol, timeframe]);

  // Create chart when data changes
  useEffect(() => {
    if (!data.length || !svgRef.current) return;
    
    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();
    
    // Setup dimensions
    const margin = { top: 20, right: 30, bottom: 30, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;
    
    // Create SVG container
    const svg = d3.select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.timestamp)) as [Date, Date])
      .range([0, width]);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.volume) as number * 1.1])
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
    
    const maData = movingAverage(data, 5);
    
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
    
    // Add volume bars
    svg.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(new Date(d.timestamp)))
      .attr("width", width / data.length * 0.8)
      .attr("y", d => yScale(d.volume))
      .attr("height", d => height - yScale(d.volume))
      .attr("fill", d => {
        // Color code bars by relative volume
        const avgVolume = d3.mean(data, d => d.volume) as number;
        if (d.volume > avgVolume * 1.5) return "#d62728"; // High volume
        if (d.volume > avgVolume) return "#ff9896"; // Above average
        return "#98df8a"; // Normal or below average
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
    
    // Add chart title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .text(`${symbol} Volume Analysis`);
    
    // Add y-axis label
    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -margin.left + 15)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .text("Volume");
      
  }, [data, symbol]);

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