'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

interface PriceChartProps {
  symbol: string;
  timeframe?: '5d' | '1m' | '3m' | '6m' | '1y' | 'ytd';
  sectorStocks?: Array<{ symbol: string; name: string; sector: string; baseMarketCap: number }>;
}

interface PriceData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ComparisonStock {
  symbol: string;
  name: string;
  data: PriceData[];
  color: string;
}

export function PriceChart({ symbol, timeframe = '1y', sectorStocks = [] }: PriceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(timeframe);
  
  const [comparisonStocks, setComparisonStocks] = useState<ComparisonStock[]>([]);
  const [availableSectorStocks, setAvailableSectorStocks] = useState<Array<{ symbol: string; name: string }>>([]);
  
  // predefined colors for comparison stocks
  const comparisonColors = ['#613498', '#59C3C3', '#3C5A14', '#DB7C26', '#DC136C'];
  const [availableColors, setAvailableColors] = useState<string[]>(comparisonColors);
  
  // Remove main stock and already selected comparison stocks
  useEffect(() => {
    if (sectorStocks.length) {
      const mainStock = sectorStocks.find(stock => stock.symbol === symbol);
      if (mainStock) {
        const mainSector = mainStock.sector;
  
        const sectorMatches = sectorStocks
          .filter(stock => stock.sector === mainSector && stock.symbol !== symbol)
          .map(stock => ({ symbol: stock.symbol, name: stock.name }));
        
        const availableStocks = sectorMatches.filter(
          stock => !comparisonStocks.some(cs => cs.symbol === stock.symbol)
        );
        
        setAvailableSectorStocks(availableStocks);
      }
    }
  }, [symbol, sectorStocks, comparisonStocks]);
  
  // Function to filter data based on selected timeframe
  const getFilteredData = (allData: PriceData[], tf: string) => {
    if (!allData.length) return [];
    
    const now = new Date();
    let startDate = new Date();
    
    // Adjust startDate based on timeframe
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
    if (!symbol) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Try to fetch from backend API with increased timeout
        const response = await axios.get(`http://3.148.170.36:3002/stock-market/daily?symbol=${symbol}`, {
          timeout: 15000 // 15 second timeout for better success rate
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
        
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const lastYearData = transformedData.filter(d => new Date(d.timestamp) >= oneYearAgo);
        
        setData(lastYearData);
      } catch (err) {
        console.warn(`Error fetching price data for ${symbol}:`, err instanceof Error ? err.message : String(err));
        
        // Generate mock data when API is unavailable
        const mockData: PriceData[] = [];
        const endDate = new Date();
        let startDate = new Date();
        startDate.setFullYear(endDate.getFullYear() - 1); // Always generate 1 year of data
        
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
    
    // Clear comparison stocks when main symbol changes
    setComparisonStocks([]);
  }, [symbol]);
  
  // Function to fetch data for a comparison stock
  const fetchComparisonStockData = async (stockSymbol: string, stockName: string) => {
    try {
      const response = await axios.get(`http://3.148.170.36:3002/stock-market/daily?symbol=${stockSymbol}`, {
        timeout: 15000
      });
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid data format received from API');
      }
      
      // Transform and sort data
      const transformedData = response.data
        .map((item: any) => ({
          timestamp: item.timestamp,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume
        }))
        .sort((a: PriceData, b: PriceData) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      
      // Limit data to last 1 year maximum
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const lastYearData = transformedData.filter((d: PriceData) => 
        new Date(d.timestamp) >= oneYearAgo
      );
      
      return lastYearData;
    } catch (err) {
      console.warn(`Error fetching comparison data for ${stockSymbol}:`, err);
      
      // Generate mock data for comparison stocks
      const mockData: PriceData[] = [];
      const endDate = new Date();
      let startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);
      
      const msPerDay = 24 * 60 * 60 * 1000;
      let currentDate = new Date(startDate);
      let basePrice = 100 + Math.random() * 200;
      
      while (currentDate <= endDate) {
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          const dailyChange = (Math.random() - 0.45) * 2;
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
        
        currentDate = new Date(currentDate.getTime() + msPerDay);
      }
      
      mockData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      return mockData;
    }
  };
  
  // Function to add a comparison stock
  const addComparisonStock = async (stockSymbol: string, stockName: string) => {
    if (comparisonStocks.length >= 5) {
      setError("Maximum of 5 comparison stocks reached");
      return;
    }
    

    const color = availableColors[0]; // Take first available color

    try {
      const stockData = await fetchComparisonStockData(stockSymbol, stockName);
      setComparisonStocks(prev => [
        ...prev,
        { symbol: stockSymbol, name: stockName, data: stockData, color }
      ]);
      setAvailableColors(prev => prev.slice(1)); // Remove assigned color from available list
    } catch (err) {
      setError(`Failed to load data for ${stockSymbol}`);
    }
  };
  
  // Function to remove a comparison stock
  const removeComparisonStock = (stockSymbol: string) => {
    setComparisonStocks(prev => {
      const stockToRemove = prev.find(stock => stock.symbol === stockSymbol);
      if (stockToRemove) {
        setAvailableColors(prev => [...prev, stockToRemove.color]); // Add color back to pool
      }
      return prev.filter(stock => stock.symbol !== stockSymbol);
    });
  
  };

  // Create chart when data or comparison stocks change
  useEffect(() => {
    if (!data.length || !svgRef.current) return;
    
    // Create tooltip
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
    
    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();
    
    // Filter data based on selected timeframe
    const filteredData = getFilteredData(data, selectedTimeframe);
    const filteredComparisonStocks = comparisonStocks.map(stock => ({
      ...stock,
      data: getFilteredData(stock.data, selectedTimeframe)
    }));
    
    if (filteredData.length === 0) {
      return; 
    }
    
    // Setup dimensions
    const margin = { top: 20, right: 30, bottom: 80, left: 60 }; // Increased bottom margin for legend
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;
    
    // Create SVG container
    const svg = d3.select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Create a clip path to prevent drawing outside the chart area
    svg.append("defs")
      .append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("width", width)
      .attr("height", height);
    
    // Create scales
    const allDataPoints = [
      ...filteredData,
      ...filteredComparisonStocks.flatMap(stock => stock.data)
    ];
    
    const xScale = d3.scaleTime()
      .domain(d3.extent(filteredData, d => new Date(d.timestamp)) as [Date, Date])
      .range([0, width]);
    
    // Store the full domain for zoom constraints
    const xDomain = xScale.domain();
    
    const yScale = d3.scaleLinear()
      .domain([
        d3.min(allDataPoints, d => d.low) as number * 0.995,
        d3.max(allDataPoints, d => d.high) as number * 1.005
      ])
      .range([height, 0]);
    
    // Create line generator for closing prices
    const line = d3.line<PriceData>()
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d.close));
    
    // Create a group for the chart content that will be zoomed
    const chartContent = svg.append("g")
      .attr("clip-path", "url(#clip)");
    
    // Add the main stock line path
    const path = chartContent.append("path")
      .datum(filteredData)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 2)
      .attr("d", line);
    
    // Add comparison stock lines
    filteredComparisonStocks.forEach(stock => {
      if (stock.data.length > 0) {
        chartContent.append("path")
          .datum(stock.data)
          .attr("fill", "none")
          .attr("stroke", stock.color)
          .attr("stroke-width", 1.5)
          .attr("opacity", 0.8)
          .attr("d", line);
      }
    });
    
    // Create x-axis with formatted ticks
    const xAxis = svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale)
        .tickFormat((d) => {
          const date = new Date(d as Date);
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }));
    
    // Add y-axis
    const yAxis = svg.append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(yScale));
    
    
    // Format numbers for tooltip
    const formatPrice = (price: number) => `$${price.toFixed(2)}`;
    const formatPercent = (percent: number) => `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`;
    const formatDate = d3.timeFormat("%b %d, %Y");
    
    // Tooltip creation - only for main stock
    const tooltipLine = chartContent.append("line")
      .attr("stroke", "#666")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("y1", 0)
      .attr("y2", height)
      .style("opacity", 0);
    const tooltipDot = chartContent.append("circle")
      .attr("r", 4)
      .attr("fill", "steelblue")
      .style("opacity", 0);
    const bisect = d3.bisector((d: PriceData) => new Date(d.timestamp)).left;
    const overlay = chartContent.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "none")
      .attr("pointer-events", "all");
    
    // Tooltip interaction
    overlay.on("mousemove", function(event) {
      if (!tooltipRef.current) return;
      
      // Get mouse position
      const [mouseX] = d3.pointer(event);
      const x0 = xScale.invert(mouseX);
      const i = bisect(filteredData, x0, 1);
      
      if (i >= filteredData.length || i < 1) return;
      
      const d0 = filteredData[i - 1];
      const d1 = filteredData[i];
      
      if (!d0 || !d1) return;
      
      const d = x0.getTime() - new Date(d0.timestamp).getTime() > 
                new Date(d1.timestamp).getTime() - x0.getTime() ? d1 : d0;
      
      const x = xScale(new Date(d.timestamp));
      const y = yScale(d.close);
      
      // Daily percent change
      const prevDay = i > 1 ? filteredData[i - 2] : null;
      const dailyChange = prevDay ? ((d.close - prevDay.close) / prevDay.close) * 100 : 0;
      
      // Position dot and line
      tooltipDot
        .style("opacity", 1)
        .attr("cx", x)
        .attr("cy", y);
      
      tooltipLine
        .style("opacity", 1)
        .attr("x1", x)
        .attr("x2", x);
      
      // Update tooltip content - main stock only
      tooltipRef.current.style.opacity = '0.9';
      tooltipRef.current.style.left = (event.pageX + 10) + "px";
      tooltipRef.current.style.top = (event.pageY - 30) + "px";
      tooltipRef.current.innerHTML = `
        <div><strong>${symbol}</strong>: ${formatDate(new Date(d.timestamp))}</div>
        <div>Open: ${formatPrice(d.open)}</div>
        <div>High: ${formatPrice(d.high)}</div>
        <div>Low: ${formatPrice(d.low)}</div>
        <div>Close: ${formatPrice(d.close)}</div>
        <div>Daily Change: ${formatPercent(dailyChange)}</div>
      `;
    })
    .on("mouseleave", function() {
      if (!tooltipRef.current) return;
      tooltipRef.current.style.opacity = '0';
      tooltipDot.style("opacity", 0);
      tooltipLine.style("opacity", 0);
    });
    
    // Add legend
    const legendGroup = svg.append("g")
      .attr("transform", `translate(0, ${height + 35})`);
    
    // Main stock legend item
    legendGroup.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 20)
      .attr("y2", 0)
      .attr("stroke", "steelblue")
      .attr("stroke-width", 2);
    
    legendGroup.append("text")
      .attr("x", 25)
      .attr("y", 4)
      .style("font-size", "12px")
      .text(`${symbol} (Main)`);
    
    // Comparison stocks legend items
    filteredComparisonStocks.forEach((stock, i) => {
      const xOffset = 120 + (i * 110); // Space out the legend items
      
      legendGroup.append("line")
        .attr("x1", xOffset)
        .attr("y1", 0)
        .attr("x2", xOffset + 20)
        .attr("y2", 0)
        .attr("stroke", stock.color)
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.8);
      
      legendGroup.append("text")
        .attr("x", xOffset + 25)
        .attr("y", 4)
        .style("font-size", "12px")
        .text(stock.symbol);
      
      // Add remove button (×)
      legendGroup.append("text")
        .attr("x", xOffset + 85)
        .attr("y", 4)
        .style("font-size", "14px")
        .style("cursor", "pointer")
        .style("fill", "#f06595")
        .text("×")
        .on("click", () => removeComparisonStock(stock.symbol));
    });
    
    // Timeframe selector
    const timeframeOptions = ['5d', '1m', '3m', '6m', '1y', 'ytd']; 
    const timeframeContainer = svg.append("g")
      .attr("transform", `translate(0, ${height + 60})`);
    
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
    
    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [data, comparisonStocks, symbol, selectedTimeframe]);

  if (loading && !data.length) {
    return <div className="h-full flex items-center justify-center">Loading price data...</div>;
  }

  if (error && !data.length) {
    return <div className="h-full flex items-center justify-center text-red-500">{error}</div>;
  }

  // comparison stock selector and legend
  return (
    <div className="h-full relative">
      {error && (
        <div className="absolute top-2 right-2 bg-amber-100 text-amber-800 text-xs p-1 rounded">
          {error}
        </div>
      )}
      
      {availableSectorStocks.length > 0 && (
  <div className="absolute top-1 left-2 flex items-center">
    <select 
      className="text-xs border rounded p-1 bg-white"
      onChange={(e) => {
        if (e.target.value) {
          const [symbol, name] = e.target.value.split('|');
          addComparisonStock(symbol, name);
          e.target.value = ''; 
        }
      }}
      disabled={comparisonStocks.length >= 5}
    >
      <option value="">+ Add comparison ({comparisonStocks.length}/5)</option>
      {availableSectorStocks.map(stock => (
        <option key={stock.symbol} value={`${stock.symbol}|${stock.name}`}>
          {stock.symbol} - {stock.name}
        </option>
      ))}
    </select>
    
    {comparisonStocks.length >= 5 && (
      <span className="ml-2 text-xs text-red-500">Max 5 comparisons</span>
    )}
  </div>
)}
      
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
}