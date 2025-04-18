import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";

interface Env {
	AIEWFSUBMISSIONS: KVNamespace;
	SECRETKEY: {
		get(): Promise<string>;
	};
}

const CONFERENCE_INFO = {
	title: "AI Engineer World's Fair 2025",
	date: "June 3–5, 2025",
	location: "San Francisco",
	venue: {
		name: "Marriott Marquis SF",
		address: "780 Mission St, San Francisco, CA 94103",
	},
	hotels: [
		{
			name: "Marriott Marquis",
			rate: "$399/night",
			dates: "May 29–Jun 7",
			bookingLink: "https://book.passkey.com/go/AIEngineer2025"
		},
		{
			name: "Beacon Grand",
			rate: "$289/night",
			groupCode: "0601AEWF",
			bookingLink: "https://www.beacongrand.com/"
		}
	],
	stats: {
		attendees: "~3,000",
		attendeeTypes: ["Founders", "VPs of AI", "AI Engineers"],
		talks: "~150 launches and talks",
		workshops: "~100 practical workshops and expo sessions",
		exhibitors: "~50 top DevTools and employers"
	},
	links: {
		tickets: "https://ti.to/software-3/ai-engineer-worlds-fair-2025",
		talks: "https://youtube.com/@aidotengineer",
		newsletter: "https://ai.engineer/newsletter",
		twitter: "https://twitter.com/aiDotEngineer",
		youtube: "https://www.youtube.com/@aiengineer",
		cfp: "https://sessionize.com/ai-engineer-worlds-fair-2025"
	},
	description: "The AI Engineer World's Fair is the largest technical conference for engineers working in AI today. Returning for its third year, this event is where the leading AI labs, founders, VPs of AI, and engineers gather to share what they're building and what's next."
};

const TRACKS = [
	"AI Architects",
	"/r/localLlama",
	"Model Context Protocol (MCP)",
	"GraphRAG",
	"AI in Action",
	"Evals",
	"Agent Reliability",
	"Reasoning and RL",
	"Retrieval, Search, and Recommendation Systems",
	"Security",
	"Infrastructure",
	"Generative Media",
	"AI Design & Novel AI UX",
	"AI Product Management",
	"Autonomy, Robotics, and Embodied Agents",
	"Computer-Using Agents (CUA)",
	"SWE Agents",
	"Vibe Coding",
	"Voice",
	"Sales/Support Agents",
	"The Great AI Debates",
	"Anything Else"
] as const;

const TRACK_DESCRIPTIONS = {
	"AI Architects": "Exclusive track for AI Leadership (CTOs, VPs of AI, and AI Architects at >1000 person enterprises). Topics include hiring and scaling AI Engineer orgs, defining AI strategy, compliance, data partnerships, and build vs buy decisions.",
	"/r/localLlama": "Any topic/high ranking posters from /r/localLlama is welcome. Focus on launches of open weights/models, local inference tools, and personal/private/local agents.",
	"Model Context Protocol (MCP)": "Talks on hard problems with MCP integration, new clients, stateful/stateless transports, sampling, auth, o11y, service discovery, and hierarchical MCP. Includes A2A protocol discussions.",
	"GraphRAG": "Talks on knowledge graphs to enhance retrieval and generation, architectures and tools for building GraphRAG applications, and real-world use cases. Special focus on agent graph memory.",
	"AI in Action": "Practical advice on using AI tooling to improve productivity. Focus on power users of Cursor, Windsurf, ChatGPT, Lindy, Notion AI etc. sharing their productivity hacks.",
	"Evals": "Overviews of frontier LLM Evals, new benchmarks, and concrete advice on making custom product evals less painful. Both LLM-as-Judge and Human-in-the-loop approaches.",
	"Agent Reliability": "Focus on making AI capabilities consistent and reliable. Looking for definitive talks that will shape the industry's reliability thinking in 2025.",
	"Reasoning and RL": "Train-time sorcery, finetune fight club, proof-of-thought, and cross-pollination between academic insights and real-world P&L.",
	"Retrieval, Search, and Recommendation Systems": "Best RAG talks and LLM-improved RecSys talks. Special focus on notable RAG/RecSys+LLM work from consumer-facing companies.",
	"Security": "Red-team tales, privacy & sovereignty, trust layers, and model supply-chain security. Focus on practical security implementations.",
	"Infrastructure": "GPU-less futures, sub-50ms inference, fleet orchestration, and LLM OS tools. Both hardware and systems software focus.",
	"Generative Media": "Models, products and platforms for generating images, audio, and video. Pipeline craft, creator economy, and ethics & IP discussions.",
	"AI Design & Novel AI UX": "New track for designers building AI-powered experiences. Both production AI product development and novel thought-provoking demos welcome.",
	"AI Product Management": "Road-mapping AI products, PM ↔ Eng handshake, metric north stars, and the art of GPT wrapping. Focus on practical PM insights.",
	"Autonomy, Robotics, and Embodied Agents": "Launches and research on LLMs x Robotics. Focus on practical applications of LLMs/Transformers in the physical world.",
	"Computer-Using Agents (CUA)": "Long running Web Search-, Browser- and other Computer-Using Agent launches and architecture breakdowns. Focus on screen vision accuracy and general purpose agents.",
	"SWE Agents": "Both Inner Loop and Outer Loop Agents for software engineers. Focus on automating software development workflows and best practices.",
	"Vibe Coding": "Code Agents for nontechnical people building ephemeral software and low code prototypes. Best practices and live demos welcome.",
	"Voice": "Real-time voice AI for personal/business needs. Focus on new models and challenges in voice agent personalization.",
	"Sales/Support Agents": "AI-powered chatbots vs. human-assisted AI for customer support. Focus on practical implementations and training approaches.",
	"The Great AI Debates": "Oxford-Style Debates on interesting AI propositions. Focus on good-faith disagreement and audience engagement.",
	"Anything Else": "Best talks in AI Engineering that don't fit cleanly in other categories. Focus on innovative and impactful content."
} as const;

// Simple hash function for emails
function hashEmail(email: string): string {
	// Convert email to lowercase and remove whitespace
	const cleanEmail = email.toLowerCase().trim();
	// Create a simple hash using the first 3 chars and last 3 chars of the local part
	// and the domain, then create a numeric hash
	const [local, domain] = cleanEmail.split('@');
	const hashStr = `${local.slice(0, 3)}${local.slice(-3)}${domain}`;
	// Simple numeric hash
	let hash = 0;
	for (let i = 0; i < hashStr.length; i++) {
		hash = ((hash << 5) - hash) + hashStr.charCodeAt(i);
		hash = hash & hash; // Convert to 32bit integer
	}
	// Convert to base36 and take first 8 chars
	return Math.abs(hash).toString(36).slice(0, 8);
}

// Generate a unique submission ID
function generateSubmissionId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 6);
	return `${timestamp}-${random}`;
}

export class MyMCP extends McpAgent<Env> {
	server = new McpServer({
		name: "Demo",
		version: "1.0.0",
		instructions: "This is a demo server for the MCP Conference 2024. It is used to submit and list talk submissions.",
		capabilities: {
			tools: ["add", "conference-details", "submit-talk", "list-submissions", "edit-talk"]
		}
	});

	async init() {
	
		this.server.tool("conference-details", 
			"Get detailed information about the AI Engineer Conference 2025, including dates, venue, submission guidelines, and other important details for speakers and attendees, straight from ai.engineer/llms.txt",
			async () => {
				const response = await fetch("https://www.ai.engineer/llms.txt");
				const text = await response.text();
				
				return {
					content: [{
						type: "text",
						text
					}]
				};
			}
		);

		this.server.resource("conference-tracks", "mcp://resource/conference-tracks", async (uri) => {
			const tracksInfo = TRACKS.map(track => ({
				name: track,
				description: TRACK_DESCRIPTIONS[track]
			}));
			
			return {
				contents: [{ uri: uri.href, text: JSON.stringify(tracksInfo, null, 2) }],
			};
		});

		this.server.resource("conference-info", "mcp://resource/conference-info", async (uri) => {
			return {
				contents: [{ uri: uri.href, text: JSON.stringify(CONFERENCE_INFO, null, 2) }],
			};
		});

		this.server.tool("submit-talk", 
		"Submit a talk proposal for the conference - make sure all fields are confirmed by the speaker before submitting - do not hallucinate any fields. If you dont know the exact email, you must ask for it before using this tool.",
		{
			speakerName: z.string().describe("Full name of the speaker"),
			email: z.string().email().describe("Email address of the speaker. If you dont know the exact email, you must ask for it before using this tool."),
			talkTitle: z.string().describe("Title of the proposed talk (can be changed later)"),
			abstract: z.string().describe("Abstract of the proposed talk - markdown is allowed. (can be changed later)"),
			tracks: z.array(z.enum(TRACKS)).describe("Possible track categories for the talk (can select up to 3)"),
			speakerTitle: z.string().optional().describe("Speaker's professional title (e.g. CTO, AI Engineer)"),
			speakerCompany: z.string().optional().describe("Speaker's company or organization"),
			speakerPhotoUrl: z.string().url().optional().describe("URL to speaker's photo (must be a valid URL)"),
			speakerBio: z.string().optional().describe("Speaker's bio - markdown is allowed"),
			reviewComments: z.string().optional().describe("Comments for the review committee on why they should consider this talk")
		}, async ({ speakerName, email, talkTitle, abstract, tracks, speakerTitle, speakerCompany, speakerPhotoUrl, speakerBio, reviewComments }) => {
			const secretHash = hashEmail(email);
			const submissionId = generateSubmissionId();
			const submission = {
				speakerName,
				email,
				secretHash,
				submissionId,
				talkTitle,
				abstract,
				tracks,
				speakerTitle,
				speakerCompany,
				speakerPhotoUrl,
				speakerBio,
				reviewComments,
				submittedAt: new Date().toISOString()
			};

			// Store in Cloudflare KV
			await this.env.AIEWFSUBMISSIONS.put(
				`talk-${submissionId}`,
				JSON.stringify(submission)
			);

			return {
				content: [{
					type: "text",
					text: `Thank you for your submission, ${speakerName}! Your talk "${talkTitle}" has been submitted for the following tracks: ${tracks.join(', ')}. We'll review it and get back to you at ${email}.\n\nYour submission ID is: ${submissionId}\nYour email hash is: ${secretHash} - you can use either to list or edit your submission.`
				}]
			};
		});

		this.server.tool("edit-talk",
		"Edit an existing talk submission. You must provide either the submission ID or email hash to identify your submission, and a valid secret key.",
		{
			submissionId: z.string().optional().describe("The unique submission ID"),
			secretHash: z.string().optional().describe("The email hash (alternative to submissionId)"),
			speakerName: z.string().optional().describe("Updated full name of the speaker"),
			email: z.string().email().optional().describe("Updated email address of the speaker"),
			talkTitle: z.string().optional().describe("Updated title of the proposed talk"),
			abstract: z.string().optional().describe("Updated abstract of the proposed talk"),
			tracks: z.array(z.enum(TRACKS)).optional().describe("Updated track categories for the talk"),
			speakerTitle: z.string().optional().describe("Updated speaker's professional title"),
			speakerCompany: z.string().optional().describe("Updated speaker's company or organization"),
			speakerPhotoUrl: z.string().url().optional().describe("Updated URL to speaker's photo"),
			speakerBio: z.string().optional().describe("Updated speaker's bio - markdown is allowed"),
			reviewComments: z.string().optional().describe("Updated comments for the review committee")
		}, async ({ submissionId, secretHash, speakerName, email, talkTitle, abstract, tracks, speakerTitle, speakerCompany, speakerPhotoUrl, speakerBio, reviewComments }) => {

			// Find the submission
			let submission;
			if (submissionId) {
				const value = await this.env.AIEWFSUBMISSIONS.get(`talk-${submissionId}`);
				if (!value) {
					return {
						content: [{
							type: "text",
							text: "No submission found with the provided ID."
						}]
					};
				}
				submission = JSON.parse(value);
			} else if (secretHash) {
				const submissions = await this.env.AIEWFSUBMISSIONS.list();
				const submissionDetails = await Promise.all(
					submissions.keys.map(async (key) => {
						const value = await this.env.AIEWFSUBMISSIONS.get(key.name);
						return value ? JSON.parse(value) : null;
					})
				);
				submission = submissionDetails.find(sub => sub?.secretHash === secretHash);
				if (!submission) {
					return {
						content: [{
							type: "text",
							text: "No submission found with the provided email hash."
						}]
					};
				}
			} else {
				return {
					content: [{
						type: "text",
						text: "Please provide either a submission ID or email hash."
					}]
				};
			}

			// Update the submission with new values
			const updatedSubmission = {
				...submission,
				speakerName: speakerName || submission.speakerName,
				email: email || submission.email,
				talkTitle: talkTitle || submission.talkTitle,
				abstract: abstract || submission.abstract,
				tracks: tracks || submission.tracks,
				speakerTitle: speakerTitle ?? submission.speakerTitle,
				speakerCompany: speakerCompany ?? submission.speakerCompany,
				speakerPhotoUrl: speakerPhotoUrl ?? submission.speakerPhotoUrl,
				speakerBio: speakerBio ?? submission.speakerBio,
				reviewComments: reviewComments ?? submission.reviewComments,
				updatedAt: new Date().toISOString()
			};

			// Store the updated submission
			await this.env.AIEWFSUBMISSIONS.put(
				`talk-${submission.submissionId}`,
				JSON.stringify(updatedSubmission)
			);

			return {
				content: [{
					type: "text",
					text: `Your submission has been updated successfully!\n\nUpdated details:\nSpeaker: ${updatedSubmission.speakerName}\nEmail: ${updatedSubmission.email}\nTitle: ${updatedSubmission.talkTitle}\nTracks: ${updatedSubmission.tracks.join(', ')}`
				}]
			};
		});

		this.server.tool("list-submissions", {
			secretHash: z.string().optional().describe("Secret hash to filter submissions")
		}, async ({ secretHash }) => {
			const submissions = await this.env.AIEWFSUBMISSIONS.list();
			const submissionDetails = await Promise.all(
				submissions.keys.map(async (key) => {
					const value = await this.env.AIEWFSUBMISSIONS.get(key.name);
					return value ? JSON.parse(value) : null;
				})
			);

			const validSubmissions = submissionDetails
				.filter((sub): sub is NonNullable<typeof sub> => sub !== null)
				.filter(sub => !secretHash || sub.secretHash === secretHash);

			if (validSubmissions.length === 0) {
				return {
					content: [{
						type: "text",
						text: secretHash 
							? "No submissions found for the provided email hash."
							: "No talk submissions found."
					}]
				};
			}

			const formattedSubmissions = validSubmissions.map(sub => 
				`Speaker: ${sub.speakerName}\n` +
				(sub.speakerTitle ? `Title: ${sub.speakerTitle}\n` : '') +
				(sub.speakerCompany ? `Company: ${sub.speakerCompany}\n` : '') +
				`Email: ${sub.email}\n` +
				`Title: ${sub.talkTitle}\n` +
				`Tracks: ${sub.tracks.join(', ')}\n` +
				`Submitted: ${new Date(sub.submittedAt).toLocaleDateString()}\n` +
				`Abstract: ${sub.abstract}\n` +
				(sub.speakerBio ? `Speaker Bio: ${sub.speakerBio}\n` : '') +
				(sub.reviewComments ? `Review Comments: ${sub.reviewComments}\n` : '') +
				`---\n`
			).join('\n');

			return {
				content: [{
					type: "text",
					text: `Found ${validSubmissions.length} talk submission(s):\n\n${formattedSubmissions}`
				}]
			};
		});
	}
}

// export default MyMCP.mount("/sse");

export default {
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		const url = new URL(request.url);
		if (url.pathname === "/listall") {
			const secretKey = url.searchParams.get("secret");
			const storedSecretKey = await env.SECRETKEY.get();
			if (!secretKey || secretKey !== storedSecretKey) {
				return new Response("Unauthorized: Invalid or missing secret key", { status: 401 });
			}

			// Get all submission keys
			const submissions = await env.AIEWFSUBMISSIONS.list();
			
			// Fetch all submission details
			const submissionDetails = await Promise.all(
				submissions.keys.map(async (key) => {
					const value = await env.AIEWFSUBMISSIONS.get(key.name);
					return value ? JSON.parse(value) : null;
				})
			);

			// Filter out null values and create CSV
			const validSubmissions = submissionDetails.filter((sub): sub is NonNullable<typeof sub> => sub !== null);
			
			// Define CSV headers
			const headers = [
				"Submission ID",
				"Speaker Name",
				"Speaker Title",
				"Speaker Company",
				"Email",
				"Talk Title",
				"Tracks",
				"Abstract",
				"Speaker Bio",
				"Review Comments",
				"Speaker Photo URL",
				"Submitted At",
				"Updated At"
			];

			// Create CSV rows with safe value handling
			const safeStr = (val: any) => {
				if (val === null || val === undefined) return '';
				return String(val).replace(/"/g, '""');
			};

			const rows = validSubmissions.map(sub => [
				safeStr(sub.submissionId),
				`"${safeStr(sub.speakerName)}"`,
				`"${safeStr(sub.speakerTitle)}"`,
				`"${safeStr(sub.speakerCompany)}"`,
				`"${safeStr(sub.email)}"`,
				`"${safeStr(sub.talkTitle)}"`,
				`"${Array.isArray(sub.tracks) ? sub.tracks.join(', ') : ''}"`,
				`"${safeStr(sub.abstract)}"`,
				`"${safeStr(sub.speakerBio)}"`,
				`"${safeStr(sub.reviewComments)}"`,
				`"${safeStr(sub.speakerPhotoUrl)}"`,
				safeStr(sub.submittedAt),
				safeStr(sub.updatedAt)
			]);

			// Combine headers and rows
			const csvContent = [
				headers.join(','),
				...rows.map(row => row.join(','))
			].join('\n');

			// Return CSV response
			return new Response(csvContent, {
				headers: {
					'Content-Type': 'text/csv',
					'Content-Disposition': 'attachment; filename="submissions.csv"'
				}
			});
		}
		// @ts-ignore
		return MyMCP.mount("/sse").fetch(request, env, ctx);
	},
	// scheduled: MyMCP.mount("/sse"),
};

// // Export the OAuth handler as the default
// export default new OAuthProvider({
// 	apiRoute: "/sse",
// 	// TODO: fix these types
// 	// @ts-ignore
// 	apiHandler: MyMCP.mount("/sse"),
// 	// @ts-ignore
// 	defaultHandler: app,
// 	authorizeEndpoint: "/authorize",
// 	tokenEndpoint: "/token",
// 	clientRegistrationEndpoint: "/register",
// });
