import * as React from "react";

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
};

export default function Image({ fill, priority: _priority, style, ...props }: ImageProps) {
  if (fill) {
    return (
      <img
        {...props}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          ...style,
        }}
      />
    );
  }

  return <img {...props} style={style} />;
}
