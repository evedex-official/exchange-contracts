import { Buffer } from "buffer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import App from "./App.tsx";
import { config } from "./wagmi.ts";

import "./index.css";
import ConfigProvider from "./providers/ConfigProvider/index.tsx";
import MatcherStateProvider from "./providers/MatcherProvider/index.tsx";

globalThis.Buffer = Buffer;

// BigInt cant't be serialized to string when using JSON.stringify

(BigInt as any).prototype["toJSON"] = function () {
  return this.toString();
};

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider>
      <WagmiProvider config={config}>
        <MatcherStateProvider>
          <QueryClientProvider client={queryClient}>
            <App />
            <ToastContainer />
          </QueryClientProvider>
        </MatcherStateProvider>
      </WagmiProvider>
    </ConfigProvider>
  </React.StrictMode>
);
