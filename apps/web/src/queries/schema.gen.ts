export interface paths {
    '/auth/sigaa': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sigaa Login */
        post: operations['sigaa_login_auth_sigaa_post'];
        /** Sigaa Logout */
        delete: operations['sigaa_logout_auth_sigaa_delete'];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/classrooms/{classroom_id}/news': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consultar notícias de uma turma do usuário
         * @description ID, título e dia das notícias da turma, sem cache.
         */
        get: operations['get_classroom_news_classrooms__classroom_id__news_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/classrooms/{classroom_id}/news/{news_id}': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consultar conteúdo e anexos de uma notícia da turma
         * @description Texto em Markdown, data e hora e anexos da notícia, sem cache.
         */
        get: operations['get_classroom_news_detail_classrooms__classroom_id__news__news_id__get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/classrooms': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar as turmas do usuário autenticado */
        get: operations['get_classrooms_classrooms_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/classrooms/{classroom_id}/members': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar docentes e discentes de uma turma do usuário */
        get: operations['get_classroom_members_classrooms__classroom_id__members_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/classrooms/{classroom_id}/statistics': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar a situação dos discentes de uma turma do usuário */
        get: operations['get_classroom_statistics_classrooms__classroom_id__statistics_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/me': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar o perfil do usuário autenticado */
        get: operations['get_me_me_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/news': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consultar notícias recentes das turmas na home do SIGAA
         * @description Notícias recentes da home, sem cache.
         */
        get: operations['get_news_news_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/restaurant/menu': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar o cardápio público do RU */
        get: operations['get_menu_restaurant_menu_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/restaurant/statement': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar extrato, saldo e grupo do estudante no RU */
        get: operations['get_statement_restaurant_statement_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    '/restaurant/token': {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consultar o token da carteirinha estudantil
         * @description Lê o QR code da carteirinha no SIGAA a cada acesso, sem persistência. Retorna token e valid_until; a validade informa mês/ano e o scraper representa o mês pelo dia 1.
         */
        get: operations['get_token_restaurant_token_get'];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * Classroom
         * @description Turma, nos campos da tabela `classrooms`.
         *
         *     `id` é o `frontEndIdTurma` do SIGAA — o único identificador presente tanto
         *     nas turmas do semestre quanto no histórico. `sigaa_id` é o id numérico
         *     interno, que só o portal do semestre expõe. `current` marca as turmas que o
         *     portal lista como atuais.
         */
        Classroom: {
            /** Id */
            id: string;
            /** Sigaa Id */
            sigaa_id?: number | null;
            /** Number */
            number: string;
            /** Semester */
            semester: string;
            /** Schedule */
            schedule?: string | null;
            /** Room */
            room?: string | null;
            /**
             * Current
             * @default false
             */
            current: boolean;
            subject: components['schemas']['Subject'];
        };
        /**
         * ClassroomMember
         * @description Participante de uma turma, nos campos da tabela `users` que a tela expõe.
         */
        ClassroomMember: {
            /** Name */
            name: string;
            role: components['schemas']['ClassroomRole'];
            /** Registration */
            registration?: string | null;
            /** Photo */
            photo?: string | null;
            /** Email */
            email?: string | null;
            /** Course */
            course?: string | null;
            /** Unity */
            unity?: string | null;
            /** Person Id */
            person_id?: number | null;
        };
        /**
         * ClassroomRole
         * @enum {string}
         */
        ClassroomRole: 'aluno' | 'professor' | 'monitor';
        /**
         * DailyMenu
         * @description Refeição que o campus não serve (ou não publicou) no dia vem `None`.
         */
        DailyMenu: {
            /**
             * Date
             * Format: date
             */
            date: string;
            /** Breakfast */
            breakfast?: components['schemas']['MenuSection'][] | null;
            /** Lunch */
            lunch?: components['schemas']['MenuSection'][] | null;
            /** Dinner */
            dinner?: components['schemas']['MenuSection'][] | null;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components['schemas']['ValidationError'][];
        };
        /** MenuSection */
        MenuSection: {
            key?: components['schemas']['MenuSectionKey'] | null;
            /** Name */
            name: string;
            /** Items */
            items: string[];
        };
        /**
         * MenuSectionKey
         * @enum {string}
         */
        MenuSectionKey:
            | 'drink'
            | 'bread'
            | 'extra'
            | 'spread'
            | 'complement'
            | 'complement_vegetarian'
            | 'complement_vegan'
            | 'fruit'
            | 'salad_1'
            | 'salad_2'
            | 'salad_dressing'
            | 'main_dish'
            | 'main_dish_vegetarian'
            | 'main_dish_vegan'
            | 'side_dish'
            | 'accompaniments'
            | 'soup'
            | 'toast'
            | 'dessert';
        /**
         * News
         * @description A home não traz `id`; hora, texto e anexos só vêm de `get_classroom_news`.
         */
        News: {
            /** Id */
            id?: number | null;
            /** Classroom Sigaa Id */
            classroom_sigaa_id?: number | null;
            /** Title */
            title: string;
            /**
             * Published On
             * Format: date
             */
            published_on: string;
            /** Published At */
            published_at?: string | null;
            /** Content */
            content?: string | null;
            /**
             * Attachments
             * @default []
             */
            attachments: components['schemas']['NewsAttachment'][];
        };
        /** NewsAttachment */
        NewsAttachment: {
            /** Name */
            name: string;
            /** Url */
            url: string;
        };
        /** RestaurantCredentials */
        RestaurantCredentials: {
            /** Token */
            token: string;
            /**
             * Valid Until
             * Format: date
             */
            valid_until: string;
        };
        /** RestaurantStatement */
        RestaurantStatement: {
            /** Balance */
            balance?: string | null;
            /** Group */
            group?: (1 | 2 | 3) | null;
            /**
             * Entries
             * @default []
             */
            entries: components['schemas']['RestaurantStatementEntry'][];
        };
        /** RestaurantStatementEntry */
        RestaurantStatementEntry: {
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
            /** Description */
            description: string;
            /** Amount */
            amount: string;
        };
        /** SigaaLoginRequest */
        SigaaLoginRequest: {
            /** Registration */
            registration: string;
            /** Password */
            password: string;
        };
        /**
         * StatisticsShare
         * @description Uma fatia do gráfico de estatísticas: a porcentagem dos discentes da turma.
         *
         *     O SIGAA arredonda cada fatia em uma casa, então a soma pode fechar em 99.9
         *     ou 100.1. O gráfico não expõe a contagem de alunos, só a porcentagem.
         */
        StatisticsShare: {
            situation: components['schemas']['StudentSituation'];
            /** Percentage */
            percentage: number;
        };
        /**
         * StudentSituation
         * @description As situações do gráfico "Situação dos Discentes", na ordem da legenda.
         * @enum {string}
         */
        StudentSituation:
            | 'aprovado'
            | 'reprovado'
            | 'reprovado_por_faltas'
            | 'reprovado_por_media_e_por_faltas'
            | 'aprovado_por_nota'
            | 'reprovado_por_nota'
            | 'reprovado_por_nota_e_faltas'
            | 'trancado'
            | 'matriculado';
        /**
         * Subject
         * @description Componente curricular, nos campos da tabela `subjects`.
         */
        Subject: {
            /** Code */
            code?: string | null;
            /** Sigaa Id */
            sigaa_id?: number | null;
            /** Name */
            name: string;
            /** Hours */
            hours?: number | null;
            /** Unity */
            unity?: string | null;
        };
        /**
         * UserLevel
         * @enum {string}
         */
        UserLevel: 'Graduação' | 'Pós-graduação' | 'Mestrado';
        /** UserProfile */
        UserProfile: {
            /** Name */
            name: string;
            /** Registration */
            registration: string;
            /** Photo */
            photo: string | null;
            /** Email */
            email?: string | null;
            /** Bio */
            bio: string | null;
            /** Unity */
            unity: string;
            /** Course */
            course: string;
            /** Integralization */
            integralization: number | null;
            /** Ira */
            ira: number | null;
            /** Mp */
            mp: number | null;
            level: components['schemas']['UserLevel'];
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    sigaa_login_auth_sigaa_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                'application/json': components['schemas']['SigaaLoginRequest'];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
        };
    };
    sigaa_logout_auth_sigaa_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': unknown;
                };
            };
        };
    };
    get_classroom_news_classrooms__classroom_id__news_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Classroom.id ou o classroom_sigaa_id de /news. */
                classroom_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['News'][];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Turma não encontrada entre as turmas do usuário. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_classroom_news_detail_classrooms__classroom_id__news__news_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Classroom.id ou o classroom_sigaa_id de /news. */
                classroom_id: string;
                /** @description ID da notícia na listagem da turma. */
                news_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['News'];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Turma fora da lista do usuário ou notícia ausente na turma. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_classrooms_classrooms_get: {
        parameters: {
            query?: {
                /** @description Sem filtro: turmas atuais. Use 'all' ou um semestre no formato AAAA.P, como 2026.2. */
                semester?: string | null;
                /** @description Ignora o cache: busca no SIGAA e atualiza o cache antes de responder. */
                refresh?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['Classroom'][];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_classroom_members_classrooms__classroom_id__members_get: {
        parameters: {
            query?: {
                /** @description Ignora o cache: busca no SIGAA e atualiza o cache antes de responder. */
                refresh?: boolean;
            };
            header?: never;
            path: {
                classroom_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['ClassroomMember'][];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Turma não encontrada entre as turmas do usuário. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_classroom_statistics_classrooms__classroom_id__statistics_get: {
        parameters: {
            query?: {
                /** @description Ignora o cache: busca no SIGAA e atualiza o cache antes de responder. */
                refresh?: boolean;
            };
            header?: never;
            path: {
                classroom_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['StatisticsShare'][];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Turma não encontrada entre as turmas do usuário. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_me_me_get: {
        parameters: {
            query?: {
                /** @description Ignora o cache: busca no SIGAA e atualiza o cache antes de responder. */
                refresh?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['UserProfile'];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_news_news_get: {
        parameters: {
            query?: {
                /** @description Resolve os IDs com uma consulta adicional à listagem de notícias por turma. */
                resolve_ids?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['News'][];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_menu_restaurant_menu_get: {
        parameters: {
            query?: {
                /** @description Campus do restaurante. */
                campus?: 'Darcy' | 'Gama' | 'Ceilandia' | 'Planaltina' | 'Fazenda';
                /** @description Ignora o cache: busca no SIGAA e atualiza o cache antes de responder. */
                refresh?: boolean;
                /** @description Dia específico (AAAA-MM-DD). */
                date?: string | null;
                /** @description Início do intervalo (AAAA-MM-DD). */
                start_date?: string | null;
                /** @description Fim do intervalo (AAAA-MM-DD). */
                end_date?: string | null;
                /** @description Retorna apenas a refeição escolhida e a data. Se não publicada no dia, a refeição é null. Sem filtro, retorna todas. */
                meal?: ('breakfast' | 'lunch' | 'dinner') | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['DailyMenu'][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['HTTPValidationError'];
                };
            };
            /** @description Site do RU indisponível ou cardápio ilegível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_statement_restaurant_statement_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['RestaurantStatement'];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_token_restaurant_token_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    'application/json': components['schemas']['RestaurantCredentials'];
                };
            };
            /** @description Credenciais ausentes ou inválidas. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description SIGAA indisponível. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
