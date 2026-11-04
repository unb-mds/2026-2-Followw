---
status: accepted
date: 2026-11-04
decision-makers: eliabexp
---

# Limitar tentativas de login por matrícula

## Contexto e problema

A cota por IP não impede força bruta distribuída contra uma mesma matrícula.

## Resultado da decisão

Cota de 10 tentativas por matrícula a cada 10 minutos, de qualquer IP, além da cota por IP.

### Consequências

* Bom, porque limita tentativas de senha contra uma mesma conta.
* Ruim, porque quem souber a matrícula pode bloquear o login dela por até 10 minutos.
