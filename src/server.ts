import { PrismaClient } from "@prisma/client";
import axios from "axios";
import fastify, { FastifyReply, FastifyRequest } from "fastify";


const app = fastify({ logger: true });
const prisma = new PrismaClient();
const CONCURRENT_LIMIT = 1;

app.register(require('@fastify/cors'), {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
});


const cheerio = require('cheerio');
const URL = "https://investidor10.com.br/acoes";
const tags = [
    "VBBR3", "BAZA3", "GOAU3", "LEVE3", "VALE3",
    "KEPL3", "BRAP4", "CMIG4", "VLID3", "PETR3",
    "BBAS3", "CEBR5", "BBSE3", "PSSA3", "ODPV3",
    "ITUB3", "CGAS5", "CPFE3", "TIMS3", "EGIE3",
    "PRIO3", "VULC3", "ISAE3", "POMO4", "VIVA3",
    "ITSA3", "SANB11", "MILS3", "SAPR11", "CXSE3",
    "CLSC3", "TTEN3", "CSMG3", "TAEE11", "RECV3",
    "BRSR5", "BEEF3", "CSAN3", "ABEV3", "STBP3",
    "WEGE3", "BRFS3", "MYPK3", "JBSS3", "TUPY3",
    "AZUL4", "MULT3", "B3SA3", "ELET5", "UGPA3",
    "CPLE5", "RAIZ4", "SOJA3", "SLCE3", "SHUL4",
    "TASA3", "AURE3", "SUZB3", "VIVT3", "EMBR3",
    "RANI3", "BBDC3", "IGTA3", "AGRO3", "KLBN11",
    "ROMI3", "ALOS3", "JALL3", "FESA4", "USIM5",
    "BRBI11"
];

app.get("/", async (request, reply) => {
    const users = await prisma.stock.findMany();
    return users;
});

app.get("/latest-stock", async (req, res) => {
    try {
        const latestStock = await prisma.stock.findFirst({
            orderBy: {
                createdAt: 'desc',
            },
        });
        if (!latestStock) {
            return res.status(404).send({ message: "Nenhum dado encontrado." });
        }
        return res.status(200).send({ latestStock });
    } catch (error) {
        console.error("Erro ao buscar dados no banco", error);
        return res.status(500).send({ message: "Erro ao buscar dados no banco." });
    }
});

app.get("/stock/:id", async (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) => {
    try {
        const { id } = req.params;

        // Busca o registro pelo ID
        const stock = await prisma.stock.findUnique({
            where: {
                id: id,
            },
        });

        if (!stock) {
            return res.status(404).send({ message: "Ação não encontrada." });
        }

        // Retorna o registro encontrado
        return res.status(200).send({ stock });
    } catch (error) {
        console.error("Erro ao buscar dados no banco", error);
        return res.status(500).send({ message: "Erro ao buscar dados no banco." });
    }
});

app.delete("/stock/:id", async (req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) => {
    try {
        const { id } = req.params;

        // Busca o registro pelo ID
        const stock = await prisma.stock.delete({
            where: {
                id: id,
            },
        });

        if (!stock) {
            return res.status(404).send({ message: "Ação não encontrada." });
        }

        // Retorna o registro encontrado
        return res.status(200).send({ stock });
    } catch (error) {
        console.error("Erro ao excluir dados no banco", error);
        return res.status(500).send({ message: "Erro ao buscar dados no banco." });
    }
});

app.get("/stocks", async (req, reply) => {
    try {
        const stocks = await prisma.stock.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
        if (stocks.length === 0) {
            return reply.status(404).send({ message: "Nenhum dado encontrado." });
        }
        return reply.status(200).send({ stocks });
    } catch (error) {
        console.error("Erro ao buscar dados no banco", error);
        return reply.status(500).send({ message: "Erro ao buscar dados no banco." });
    }
});

app.get("/info", async (req, res) => {
    try {
        const data = await getTickes();

        await prisma.stock.createMany({
            data: {
                data: data
            }
        });

        return res.status(200).send({ data });
    } catch (error) {
        console.error("Erro na rota /info:", error);
        return res.status(500).send({
            message: "Error fetching posts"
        });
    }
});

async function getTickes() {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(CONCURRENT_LIMIT);

    const promises = tags.map((tag) =>
        limit(async () => {
            try {
                const response = await axios.get(`${URL}/${tag}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                // Verifique o status da requisição
                if (response.status !== 200) {
                    console.error(`Erro na requisição: Status ${response.status}`);
                    return { tag, indicators: null, cotacaoTexto: null };
                }

                // Verifique se os dados estão presentes
                if (!response.data) {
                    console.error(`Dados vazios para a tag: ${tag}`);
                    return { tag, indicators: null, cotacaoTexto: null };
                }

                const html = response.data;

                // Verifique se o HTML é uma string válida
                if (typeof html !== 'string') {
                    console.error(`HTML inválido para a tag: ${tag}`);
                    return { tag, indicators: null, cotacaoTexto: null };
                }


                // Inicialize o cheerio
                const $ = cheerio.load(html);

                const indicators: { [key: string]: string } = {};

                $('#table-indicators .cell').each((i: any, element: any) => {
                    const titulo = $(element).find('span.d-flex').text().trim();
                    const valor = $(element).find('div.value span').text().trim();

                    if (titulo && valor) {
                        const formattedTitulo = titulo.replace(/\s+/g, '_');
                        indicators[formattedTitulo] = valor;
                    }
                });

                const cotacaoTexto = $('._card.cotacao')
                    .find('._card-body')
                    .find('div:first')
                    .find('span')
                    .text()
                    .trim();

                const src = $('.page-subheader .logo img').attr('src');
                const logo = 'https://investidor10.com.br' + src;

                console.log(`===== ✅ SUCESSO: ${tag} =====`);
                console.log(`Cotação: ${cotacaoTexto}`);
                console.log("=====================================\n");

                return { tag, cotacao: cotacaoTexto, logo: logo, indicators };

            } catch (error) {
                console.error(`===== ❌ ERRO: ${tag} =====`);
                console.error(`Erro: ${(error as Error).message}`);
                console.error("=====================================\n");
                return { tag, indicators: null, cotacaoTexto: null };
            }
        })
    );

    const data = await Promise.all(promises);
    return data;
}
app.listen({
    host: '0.0.0.0',
    port: process.env.PORT ? Number(process.env.PORT) : 3333,
}).then(() => {
    console.log('Server is running on port 3333');
});