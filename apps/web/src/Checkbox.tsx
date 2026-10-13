import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Check } from 'lucide-react';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type' | 'className' | 'children'> & {
  children: ReactNode;
  className?: string;
};

/** A native checkbox with shared visual chrome; label clicks, Space and forms stay native. */
export function Checkbox({ children, className = '', disabled, ...inputProps }: Props) {
  return <label className={`ui-checkbox ${className}`} data-disabled={disabled || undefined}>
    <input {...inputProps} type="checkbox" disabled={disabled} className="ui-checkbox-input" />
    <span className="ui-checkbox-box" aria-hidden="true"><Check size={12} strokeWidth={2.5}/></span>
    <span className="ui-checkbox-label">{children}</span>
  </label>;
}
