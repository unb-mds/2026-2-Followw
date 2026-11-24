import { Fragment, type ReactNode } from 'react';

export const repeat = (count: number, render: (index: number) => ReactNode) =>
    Array.from({ length: count }, (_, index) => <Fragment key={index}>{render(index)}</Fragment>);
