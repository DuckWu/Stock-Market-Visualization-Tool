# Stock Market Dashboard

A modern web application for visualizing stock market data using Next.js, NestJS, and D3.js.

## Features

- Real-time stock market data visualization
- Interactive charts and graphs
- Daily and intraday data views
- Modern, responsive UI
- Three different visualization types:
  - Line chart for price trends
  - Bar chart for volume analysis
  - Swarm plot for price distribution

## Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- Alpha Vantage API key (get one for free at https://www.alphavantage.co/)

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd stock-market-dashboard
```

2. Install dependencies for both frontend and backend:
```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

3. Create a `.env` file in the backend directory and add your Alpha Vantage API key:
```
ALPHA_VANTAGE_API_KEY=your_api_key_here
```

4. Start the development servers:

In one terminal (backend):
```bash
cd backend
npm run start:dev
```

In another terminal (frontend):
```bash
cd frontend
npm run dev
```

5. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Enter a stock symbol (e.g., AAPL, GOOGL, MSFT) in the search bar
2. Select a timeframe (Daily or Intraday)
3. View the different visualizations:
   - Price Chart: Shows the stock's price movement over time
   - Volume Analysis: Displays trading volume data
   - Price Distribution: Interactive swarm plot showing price distribution

## Technologies Used

- Frontend:
  - Next.js
  - React
  - Tailwind CSS
  - Recharts
  - D3.js
  - TypeScript

- Backend:
  - NestJS
  - TypeScript
  - Axios
  - Alpha Vantage API

## License

MIT 