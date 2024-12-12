import { http, createConfig } from "wagmi";
import { localhost } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const customLocalhost = {
  ...localhost,
  rpcUrls: {
    ...localhost.rpcUrls,
    default: {
      http: ["http://127.0.0.1:8555"],
    },
  },
};

export const config = createConfig({
  chains: [customLocalhost],
  connectors: [injected()],
  transports: {
    [localhost.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
