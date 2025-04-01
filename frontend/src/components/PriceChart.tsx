'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

interface PriceChartProps {
  symbol: string;
  timeframe?: '5d' | '1m' | '3m' | '6m' | '1y' | 'ytd';
}

interface PriceData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function PriceChart({ symbol, timeframe = '1m' }: PriceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Try to fetch from backend API with increased timeout
        const response = await axios.get(`http://localhost:3002/stock-market/daily?symbol=${symbol}`, {
          timeout: 8000 // 8 second timeout for better success rate
        });
        
        if (!response.data || !Array.isArray(response.data)) {
          throw new Error('Invalid data format received from API');
        }
        
        // Transform the data to match our PriceData interface
        const transformedData = response.data.map((item: any) => ({
          timestamp: item.timestamp,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume
        }));
        
        // Sort by timestamp in ascending order (oldest first)
        transformedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        setData(transformedData);
      } catch (err) {
        console.warn(`Error fetching price data for ${symbol}:`, err instanceof Error ? err.message : String(err));
        
        // Generate mock data when API is unavailable
        const mockData: PriceData[] = [];
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
        
        // Generate price data
        const msPerDay = 24 * 60 * 60 * 1000;
        let currentDate = new Date(startDate);
        let basePrice = 100 + Math.random() * 200; // Random starting price
        
        while (currentDate <= endDate) {
          // Skip weekends
          if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
            const dailyChange = (Math.random() - 0.45) * 2; // Slight upward bias
            basePrice = basePrice * (1 + dailyChange / 100);
            
            const open = basePrice * (1 + (Math.random() - 0.5) * 0.01);
            const close = basePrice;
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);
            
            mockData.push({
              timestamp: currentDate.toISOString(),
              open,
              high,
              low,
              close,
              volume: Math.floor(100000 + Math.random() * 900000)
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
    const margin = { top: 20, right: 30, bottom: 30, left: 50 };
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
      .domain([
        d3.min(data, d => d.low) as number * 0.95,
        d3.max(data, d => d.high) as number * 1.05
      ])
      .range([height, 0]);
    
    // Create line generator for closing prices
    const line = d3.line<PriceData>()
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d.close));
    
    // Add x-axis
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale));
    
    // Add y-axis
    svg.append("g")
      .call(d3.axisLeft(yScale));
    
    // Add the line path
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 1.5)
      .attr("d", line);
    
    // Add chart title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .text(`${symbol} Price Chart`);
      
  }, [data, symbol]);

  if (loading) {
    return <div className="h-full flex items-center justify-center">Loading price data...</div>;
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