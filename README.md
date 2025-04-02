# Stock Visualization Tool

A comprehensive stock market visualization and analysis platform built with modern web technologies by Xiaotao Wu and Kyra Riedel.

## Overview

This application provides interactive stock market data visualization with AI-powered analysis, helping users make informed investment decisions through intuitive visual representations and intelligent insights.

## Key Features

- **Interactive Stock Visualization**: Dynamic swarm plot showing relationships between different stocks
- **Real-time Stock Data**: Up-to-date price and volume information from Yahoo Finance
- **AI-Powered Analysis**: Sentiment analysis, technical insights, and risk assessment using TinyLlama
- **Comprehensive Metrics**: Price trends, volume analysis, volatility measurements, and key ratios
- **Responsive Design**: Seamless experience across desktop and mobile devices

## Technology Stack

### Backend
- **Framework**: NestJS
- **Language**: TypeScript
- **Data Source**: Yahoo Finance API
- **AI Processing**: TinyLlama (local) with fallback to command-line execution
- **Infrastructure**: Deployed on Amazon EC2

### Frontend
- **Framework**: Next.js
- **Styling**: Tailwind CSS
- **Data Visualization**: D3.js, Recharts
- **State Management**: React hooks for component state
- **API Communication**: Axios for HTTP requests

## Setup and Installation

### Prerequisites
- Node.js (v16+)
- npm or yarn
- TinyLlama model for local AI analysis

### Backend Setup
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env to configure your settings

# Start development server
npm run start:dev
```

### Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## Deployment

The application is configured for deployment on Amazon EC2:

### Backend
- The backend runs on port 3002
- TinyLlama is used for AI analysis
- Environment variables control API endpoints and model paths

### Frontend
- The frontend runs on port 3000
- CORS is configured for communication with the backend
- Extended timeouts handle AI processing time

## API Endpoints

- `GET /stock-market/daily?symbol={symbol}`: Retrieve daily historical stock data
- `GET /stock-market/intraday?symbol={symbol}`: Get intraday stock data
- `POST /stock-market/analyze`: Generate AI analysis for specified stock

## Authors

- **Xiaotao Wu** - Backend development, AI integration, and infrastructure
- **Kyra Riedel** - Frontend development, data visualization, and user experience

## License

This project is licensed under the MIT License.

## Acknowledgments

- Yahoo Finance for providing stock market data
- TinyLlama project for the AI capabilities
- D3.js and Recharts for powerful visualization tools 