import React from "react";
import Button from "../Button";

type CollapseProps = {
  children: any;
  title: any;
};

const Collapse: React.FC<CollapseProps> = ({ title, children }) => {
  const [show, setShow] = React.useState<boolean>(true);
  const contentClassNames = ["collapse-content"];
  if (show) {
    contentClassNames.push("collapse-content--visible");
  }
  const contentClassName = contentClassNames.join(" ");
  const toggleShow = () => setShow((prev) => !prev);
  return (
    <div className="collapse">
      <div className="collapse-header">
        <h3 className="collapse-title">{title}</h3>
        <div className="collapse-toggle">
          <Button onClick={toggleShow}>{show ? "-" : "+"}</Button>
        </div>
      </div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
};

export default Collapse;
