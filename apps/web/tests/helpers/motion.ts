import { MotionGlobalConfig } from 'motion/react';

// animações concluem na hora: os testes verificam estados, não a interpolação
MotionGlobalConfig.skipAnimations = true;
