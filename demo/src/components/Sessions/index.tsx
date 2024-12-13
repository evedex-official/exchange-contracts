import React from "react";
import useSession from "../../hooks/useSessions";
import SessionForm from "../../forms/SessionForm";

const Sessions: React.FC = () => {
  const { data } = useSession();
  return (
    <div>
      <h3>Sessions</h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <SessionForm />
    </div>
  );
};

export default Sessions;
