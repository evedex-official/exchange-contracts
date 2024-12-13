import React, { useMemo } from "react";
import useSession from "../../hooks/useSessions";
import SessionForm from "../../forms/SessionForm";

const Sessions: React.FC = () => {
  const { data } = useSession();
  const parsedData = useMemo(() => {
    return Object.keys(data || {}).reduce((acc, key) => {
      const localItem = data[key];

      if (localItem) {
        acc[key] = {
          ...localItem,
          expiration: localItem.expiration.toString(),
          allowanceAllowed: localItem.allowanceAllowed.toString(),
        };
      }

      return acc;
    }, {} as any);
  }, [data]);
  return (
    <div>
      <h3>Sessions</h3>
      <pre>{JSON.stringify(parsedData, null, 2)}</pre>
      <SessionForm />
    </div>
  );
};

export default Sessions;
