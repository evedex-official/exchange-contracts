import React, { useMemo } from "react";
import useSession from "../../hooks/useSessions";
import SessionForm from "../../forms/SessionForm";

const Sessions: React.FC = () => {
  return (
    <div>
      <SessionForm />
    </div>
  );
};

export default Sessions;
