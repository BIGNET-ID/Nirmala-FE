import { Icon } from '@iconify/react';

export default function AppIcon({ icon, width = 24, ...props }) {
  return <Icon icon={icon} width={width} {...props} />;
}