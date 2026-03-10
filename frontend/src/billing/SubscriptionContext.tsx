import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Purchases, { CustomerInfo } from "react-native-purchases";
import { getCustomerInfoSafe, isPro } from "./revenuecat";
import { useAuth } from "../context/AuthContext";

type SubscriptionContextType = {
  customerInfo: CustomerInfo | null;
  pro: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(
  undefined,
);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { token, user } = useAuth(); // user do re-renderu po logowaniu/wylogowaniu
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [pro, setPro] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const info = await getCustomerInfoSafe();
      setCustomerInfo(info);
      setPro(info ? isPro(info) : false);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // po starcie i po zmianie usera (login/logout) odśwież CustomerInfo
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

  useEffect(() => {
    // listener na zmiany subskrypcji (np. restore, zakup, wygasło)
    const sub = Purchases.addCustomerInfoUpdateListener((info) => {
      setCustomerInfo(info);
      setPro(isPro(info));
    });

    return () => {
      // SDK samo czyści listener; zostawiamy return dla porządku
      // (w zależności od wersji SDK remove może być niedostępne)
      // @ts-ignore
      sub?.remove?.();
    };
  }, []);

  const value = useMemo(
    () => ({ customerInfo, pro, refreshing, refresh }),
    [customerInfo, pro, refreshing],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx)
    throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
};
