# Stock Market Analysis Dashboard

A modern web application that provides real-time stock market data visualization and AI-powered analysis using NestJS backend and Next.js frontend.

## Features

- 📈 Real-time stock data visualization
- 🔍 Interactive stock search and selection
- 📊 Price and volume charts
- 🤖 AI-powered stock analysis using Hugging Face
- 📱 Responsive design
- 🌐 Real-time data from Yahoo Finance

## Tech Stack

### Backend
- NestJS
- TypeScript
- Yahoo Finance API
- Hugging Face Inference API

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- D3.js for visualizations
- Recharts for charts

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Hugging Face API key

## Environment Variables

### Backend (.env)
```
QWEN_API_KEY=your_huggingface_api_key_here
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

## Running the Application

1. Start the backend server:
```bash
cd backend
npm run start:dev
```

2. Start the frontend development server:
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3002

## API Endpoints

### Stock Market Data
- `GET /stock-market/daily?symbol=<symbol>` - Get daily stock data
- `GET /stock-market/intraday?symbol=<symbol>` - Get intraday stock data
- `POST /stock-market/analyze` - Get AI analysis for a stock

## Features in Detail

### Stock Visualization
- Interactive swarm plot showing stock relationships
- Price and volume charts
- Real-time data updates

### AI Analysis
- Sentiment analysis
- Technical analysis
- Key points and risk factors
- Market performance summary

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 