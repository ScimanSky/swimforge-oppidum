import * as React from "react";
import { Link as WouterLink } from "wouter";

type LinkProps = React.ComponentProps<typeof WouterLink> & {
  className?: string;
};

export default function Link(props: LinkProps) {
  return <WouterLink {...props} />;
}
