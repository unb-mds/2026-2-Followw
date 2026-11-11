import { createContext, useContext } from 'react';

export const DesktopContext = createContext(false);
export const useDesktop = () => useContext(DesktopContext);
