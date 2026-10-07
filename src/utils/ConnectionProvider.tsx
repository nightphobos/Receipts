import { Connection, type ConnectionConfig } from "@solana/web3.js";
import React, {
  type FC,
  type ReactNode,
  useMemo,
  createContext,
  useContext,
} from "react";
import { useCluster } from "../components/cluster/cluster-data-access";
import { demoConnection } from "../demo/DemoConnection";
import { useDemo } from "../demo/store";

export interface ConnectionProviderProps {
  children: ReactNode;
  config?: ConnectionConfig;
}

export const ConnectionProvider: FC<ConnectionProviderProps> = ({
  children,
  config = { commitment: "confirmed" },
}) => {
  const { selectedCluster } = useCluster();

  const demo = useDemo().active;
  const live = useMemo(
    () => new Connection(selectedCluster.endpoint, config),
    [selectedCluster, config]
  );
  // Demo mode: the simulated chain (no network), shaped like the Connection methods the app uses.
  const connection = demo ? (demoConnection as unknown as Connection) : live;

  return (
    <ConnectionContext.Provider value={{ connection }}>
      {children}
    </ConnectionContext.Provider>
  );
};

export interface ConnectionContextState {
  connection: Connection;
}

export const ConnectionContext = createContext<ConnectionContextState>(
  {} as ConnectionContextState
);

export function useConnection(): ConnectionContextState {
  return useContext(ConnectionContext);
}
