import { AppState } from "./types";

export const scenarios: Record<string, Partial<AppState>> = {
  default: {
    currentUser: {
      id: "client1",
      name: "Tech Startup Inc",
      avatar: "",
      role: "client",
      company: "Tech Startup Inc",
    },
    freelancers: [
      {
        id: "charlesdavis",
        name: "Charles D.",
        title: "Senior Full Stack Developer",
        avatar: "",
        location: "Portland, OR",
        hourlyRate: 30,
        earnings: "$10k+",
        jobsCompleted: 15,
        hoursWorked: 400,
        rating: 4.9,
        available: true,
        skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "AWS"],
        description:
          "Experienced full-stack developer specializing in modern web applications. Focused on clean code and scalable architectures.",
        employmentHistory: [
          {
            id: "job1",
            title: "Full-Stack Developer for E-commerce Application",
            company: "ShopEasy Corp",
            startDate: "2023-06",
            endDate: "2023-12",
            description:
              "Developed a complete e-commerce solution using React and Node.js. Implemented payment processing, inventory management, and real-time order tracking.",
            rating: 5.0,
            feedback:
              "Charles delivered exceptional work. The application exceeded our expectations.",
          },
          {
            id: "job2",
            title: "React Developer for SaaS Dashboard",
            company: "DataViz Inc",
            startDate: "2023-01",
            endDate: "2023-05",
            description:
              "Built interactive dashboards with complex data visualizations. Optimized performance for large datasets.",
            rating: 4.8,
            feedback:
              "Great communication and technical skills. Would hire again.",
          },
        ],
        education: [
          {
            id: "edu1",
            degree: "BS",
            school: "Oregon State University",
            field: "Computer Science",
            startYear: 2015,
            endYear: 2019,
          },
        ],
      },
      {
        id: "sarahw",
        name: "Sarah W.",
        title: "UI/UX Designer",
        avatar: "",
        location: "San Francisco, CA",
        hourlyRate: 75,
        earnings: "$50k+",
        jobsCompleted: 42,
        hoursWorked: 1200,
        rating: 5.0,
        available: true,
        skills: ["Figma", "Adobe XD", "Sketch", "User Research", "Prototyping"],
        description:
          "Award-winning designer with 8+ years creating intuitive digital experiences.",
        employmentHistory: [
          {
            id: "job-sarah1",
            title: "UI/UX Design for FinTech Mobile App",
            company: "FinanceFlow",
            startDate: "2023-03",
            endDate: "2023-08",
            description:
              "Redesigned the entire mobile banking app with focus on accessibility and user engagement. Increased user retention by 45%.",
            rating: 5.0,
            feedback:
              "Sarah's designs were absolutely stunning and user-friendly. She exceeded all our expectations.",
          },
          {
            id: "job-sarah2",
            title: "Design System Creation for SaaS Platform",
            company: "CloudSync Solutions",
            startDate: "2022-09",
            endDate: "2023-02",
            description:
              "Built a comprehensive design system from scratch, including components, patterns, and guidelines for consistency across products.",
            rating: 5.0,
            feedback:
              "Exceptional work on our design system. Sarah's attention to detail is unmatched.",
          },
        ],
        education: [
          {
            id: "edu-sarah1",
            degree: "MFA",
            school: "California Institute of the Arts",
            field: "Interaction Design",
            startYear: 2013,
            endYear: 2015,
          },
        ],
      },
      {
        id: "mikej",
        name: "Mike J.",
        title: "DevOps Engineer",
        avatar: "",
        location: "Austin, TX",
        hourlyRate: 85,
        earnings: "$30k+",
        jobsCompleted: 28,
        hoursWorked: 800,
        rating: 4.7,
        available: false,
        skills: ["AWS", "Docker", "Kubernetes", "CI/CD", "Terraform"],
        description:
          "Cloud infrastructure specialist helping teams scale their applications.",
        employmentHistory: [
          {
            id: "job-mike1",
            title: "DevOps Lead for E-learning Platform",
            company: "EduTech Global",
            startDate: "2023-01",
            endDate: "2023-07",
            description:
              "Migrated legacy infrastructure to AWS, implemented CI/CD pipelines, and reduced deployment time by 80%. Managed Kubernetes clusters serving 2M+ users.",
            rating: 4.9,
            feedback:
              "Mike transformed our infrastructure. His expertise in cloud architecture is outstanding.",
          },
          {
            id: "job-mike2",
            title: "Cloud Infrastructure Automation",
            company: "StreamMedia Inc",
            startDate: "2022-06",
            endDate: "2022-12",
            description:
              "Automated infrastructure provisioning using Terraform and implemented monitoring solutions. Achieved 99.99% uptime for critical services.",
            rating: 4.8,
            feedback:
              "Excellent DevOps engineer. Mike's automation saved us thousands of hours.",
          },
        ],
        education: [
          {
            id: "edu-mike1",
            degree: "BS",
            school: "University of Texas at Austin",
            field: "Computer Engineering",
            startYear: 2012,
            endYear: 2016,
          },
        ],
      },
      {
        id: "briank",
        name: "Brian K.",
        title: "Full Stack Developer",
        avatar: "",
        location: "Columbus, OH",
        hourlyRate: 65,
        earnings: "$25k+",
        jobsCompleted: 32,
        hoursWorked: 950,
        rating: 4.9,
        available: true,
        skills: ["Vue.js", "Laravel", "MySQL", "Redis", "Digital Ocean"],
        description:
          "Experienced developer focused on building scalable web applications.",
        employmentHistory: [
          {
            id: "job-brian1",
            title: "Full Stack Development for Healthcare Portal",
            company: "MediCare Solutions",
            startDate: "2023-02",
            endDate: "2023-09",
            description:
              "Built a patient portal using Vue.js and Laravel, integrating with multiple healthcare APIs. Implemented HIPAA-compliant security measures.",
            rating: 5.0,
            feedback:
              "Brian delivered a fantastic healthcare portal. His code quality and communication were excellent.",
          },
          {
            id: "job-brian2",
            title: "E-commerce Platform Optimization",
            company: "ShopFast",
            startDate: "2022-08",
            endDate: "2023-01",
            description:
              "Optimized database queries and implemented caching strategies, reducing page load times by 60%. Integrated multiple payment gateways.",
            rating: 4.9,
            feedback:
              "Outstanding performance improvements. Brian really knows his stuff.",
          },
        ],
        education: [
          {
            id: "edu-brian1",
            degree: "BS",
            school: "Ohio State University",
            field: "Software Engineering",
            startYear: 2014,
            endYear: 2018,
          },
        ],
      },
      {
        id: "carola",
        name: "Carol A.",
        title: "UI/UX Designer",
        avatar: "",
        location: "Miami, FL",
        hourlyRate: 55,
        earnings: "$40k+",
        jobsCompleted: 58,
        hoursWorked: 1500,
        rating: 4.8,
        available: true,
        skills: [
          "Sketch",
          "InVision",
          "Adobe CC",
          "Wireframing",
          "User Testing",
        ],
        description:
          "Creative designer passionate about creating beautiful and functional interfaces.",
        employmentHistory: [
          {
            id: "job-carol1",
            title: "UI Design for Travel Booking Platform",
            company: "WanderLust Travel",
            startDate: "2023-04",
            endDate: "2023-10",
            description:
              "Redesigned the entire booking flow, resulting in 35% increase in conversions. Created a cohesive visual language across web and mobile platforms.",
            rating: 4.9,
            feedback:
              "Carol's designs transformed our platform. Users love the new interface!",
          },
          {
            id: "job-carol2",
            title: "Brand Identity & Web Design",
            company: "StartupHub",
            startDate: "2022-11",
            endDate: "2023-03",
            description:
              "Developed complete brand identity including logo, color palette, and typography. Designed and implemented responsive website using modern design principles.",
            rating: 4.8,
            feedback:
              "Carol brought our brand vision to life beautifully. Highly recommended designer.",
          },
          {
            id: "job-carol3",
            title: "Mobile App UI/UX Design",
            company: "FitLife App",
            startDate: "2022-05",
            endDate: "2022-10",
            description:
              "Designed intuitive fitness tracking app with focus on user motivation and engagement. Conducted user research and usability testing.",
            rating: 5.0,
            feedback:
              "Amazing work! Carol's designs made our app stand out in a crowded market.",
          },
        ],
        education: [
          {
            id: "edu-carol1",
            degree: "BFA",
            school: "Miami International University of Art & Design",
            field: "Graphic Design",
            startYear: 2011,
            endYear: 2015,
          },
        ],
      },
      {
        id: "chriso",
        name: "Chris O.",
        title: "Blockchain Expert",
        avatar: "",
        location: "Denver, CO",
        hourlyRate: 120,
        earnings: "$70k+",
        jobsCompleted: 22,
        hoursWorked: 600,
        rating: 4.9,
        available: false,
        skills: ["Solidity", "Web3.js", "Ethereum", "Smart Contracts", "DeFi"],
        description:
          "Blockchain developer specializing in DeFi and smart contract development.",
        employmentHistory: [
          {
            id: "job-chris1",
            title: "Smart Contract Development for DeFi Protocol",
            company: "DeFi Ventures",
            startDate: "2023-01",
            endDate: "2023-06",
            description:
              "Developed and audited smart contracts for a decentralized lending protocol. Implemented complex tokenomics and governance mechanisms on Ethereum.",
            rating: 5.0,
            feedback:
              "Chris is a blockchain genius. His smart contracts passed all security audits with flying colors.",
          },
          {
            id: "job-chris2",
            title: "NFT Marketplace Development",
            company: "ArtChain",
            startDate: "2022-07",
            endDate: "2022-12",
            description:
              "Built a complete NFT marketplace with minting, trading, and royalty features. Integrated with multiple wallets and implemented gas optimization strategies.",
            rating: 4.9,
            feedback:
              "Exceptional blockchain developer. Chris delivered a robust and efficient NFT platform.",
          },
        ],
        education: [
          {
            id: "edu-chris1",
            degree: "MS",
            school: "University of Colorado Boulder",
            field: "Computer Science",
            startYear: 2016,
            endYear: 2018,
          },
          {
            id: "edu-chris2",
            degree: "BS",
            school: "University of Colorado Boulder",
            field: "Mathematics",
            startYear: 2012,
            endYear: 2016,
          },
        ],
      },
    ],
    jobs: [
      {
        id: "job-ecom",
        title: "E-commerce Platform Development",
        description:
          "Need a full-stack developer to build a custom e-commerce platform with React frontend and Node.js backend.",
        client: "Tech Startup Inc",
        posted: "2 hours ago",
        budget: "$5,000 - $10,000",
        duration: "1-3 months",
        experienceLevel: "Expert",
        category: "Web Development",
        skills: ["React", "Node.js", "PostgreSQL", "AWS"],
        proposals: 12,
        status: "open",
      },
      {
        id: "job-mobile",
        title: "Mobile App Development for iOS and Android",
        description:
          "Looking for experienced mobile developer to create a cross-platform app for our fitness startup.",
        client: "FitLife Solutions",
        posted: "5 hours ago",
        budget: "$8,000 - $15,000",
        duration: "2-4 months",
        experienceLevel: "Expert",
        category: "Mobile Development",
        skills: ["React Native", "TypeScript", "Firebase", "iOS", "Android"],
        proposals: 8,
        status: "open",
      },
      {
        id: "job-design",
        title: "UI/UX Redesign for SaaS Dashboard",
        description:
          "We need a talented designer to completely redesign our analytics dashboard for better user experience.",
        client: "DataMetrics Pro",
        posted: "1 day ago",
        budget: "$3,000 - $5,000",
        duration: "3-4 weeks",
        experienceLevel: "Intermediate",
        category: "Design",
        skills: ["Figma", "User Research", "Prototyping", "Design Systems"],
        proposals: 25,
        status: "open",
      },
      {
        id: "job-api",
        title: "REST API Development for Payment Processing",
        description:
          "Build secure REST APIs for our payment processing system with proper authentication and error handling.",
        client: "PayFlow Inc",
        posted: "3 days ago",
        budget: "$50 - $75/hr",
        duration: "6-8 weeks",
        experienceLevel: "Expert",
        category: "Backend Development",
        skills: ["Node.js", "Express", "MongoDB", "OAuth", "Stripe API"],
        proposals: 18,
        status: "open",
      },
    ],
    contracts: [],
    messages: [
      {
        id: "msg1",
        senderId: "charlesdavis",
        recipientId: "client1",
        content:
          "Hi! I saw your e-commerce project and I'm very interested. I have extensive experience building similar platforms.",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg2",
        senderId: "client1",
        recipientId: "charlesdavis",
        content:
          "Hi Charles, thanks for reaching out! Your portfolio looks great. Can you tell me more about your experience with payment integrations?",
        timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      },
      {
        id: "msg3",
        senderId: "charlesdavis",
        recipientId: "client1",
        content:
          "Absolutely! I've integrated Stripe, PayPal, and Square into multiple e-commerce platforms. I can also implement PCI compliance best practices.",
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg4",
        senderId: "sarahw",
        recipientId: "client1",
        content:
          "Hello! I noticed you're looking for someone to help with the e-commerce platform. I'd love to help with the UI/UX design aspects.",
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg5",
        senderId: "client1",
        recipientId: "sarahw",
        content:
          "Hi Sarah, that sounds great! We definitely need help with the design. Do you have experience with e-commerce user flows?",
        timestamp: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },

  hiringFlow: {
    currentUser: {
      id: "client1",
      name: "Tech Startup Inc",
      avatar: "",
      role: "client",
      company: "Tech Startup Inc",
    },
    freelancers: [
      {
        id: "charlesdavis",
        name: "Charles D.",
        title: "Senior Full Stack Developer",
        avatar: "",
        location: "Portland, OR",
        hourlyRate: 30,
        earnings: "$10k+",
        jobsCompleted: 15,
        hoursWorked: 400,
        rating: 4.9,
        available: true,
        skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "AWS"],
        description:
          "Experienced full-stack developer specializing in modern web applications. I focus on building scalable, maintainable solutions with clean architecture. Strong background in both startup and enterprise environments.",
        employmentHistory: [
          {
            id: "job1",
            title: "Full-Stack Developer for E-commerce Application",
            company: "ShopEasy Corp",
            startDate: "2023-06",
            endDate: "2023-12",
            description:
              "Developed a complete e-commerce solution using React and Node.js. Implemented payment processing, inventory management, and real-time order tracking.",
            rating: 5.0,
            feedback:
              "Charles delivered exceptional work. The application exceeded our expectations.",
          },
          {
            id: "job2",
            title: "React Developer for SaaS Dashboard",
            company: "DataViz Inc",
            startDate: "2023-01",
            endDate: "2023-05",
            description:
              "Built interactive dashboards with complex data visualizations. Optimized performance for large datasets.",
            rating: 4.8,
            feedback:
              "Great communication and technical skills. Would hire again.",
          },
        ],
        education: [
          {
            id: "edu1",
            degree: "BS",
            school: "Oregon State University",
            field: "Computer Science",
            startYear: 2015,
            endYear: 2019,
          },
        ],
      },
      {
        id: "sarahw",
        name: "Sarah W.",
        title: "UI/UX Designer",
        avatar: "",
        location: "San Francisco, CA",
        hourlyRate: 75,
        earnings: "$50k+",
        jobsCompleted: 42,
        hoursWorked: 1200,
        rating: 5.0,
        available: true,
        skills: ["Figma", "Adobe XD", "Sketch", "User Research", "Prototyping"],
        description:
          "Award-winning designer with 8+ years creating intuitive digital experiences. I specialize in user-centered design and have worked with Fortune 500 companies and innovative startups.",
        employmentHistory: [
          {
            id: "job-sarah1",
            title: "UI/UX Design for FinTech Mobile App",
            company: "FinanceFlow",
            startDate: "2023-03",
            endDate: "2023-08",
            description:
              "Redesigned the entire mobile banking app with focus on accessibility and user engagement. Increased user retention by 45%.",
            rating: 5.0,
            feedback:
              "Sarah's designs were absolutely stunning and user-friendly. She exceeded all our expectations.",
          },
          {
            id: "job-sarah2",
            title: "Design System Creation for SaaS Platform",
            company: "CloudSync Solutions",
            startDate: "2022-09",
            endDate: "2023-02",
            description:
              "Built a comprehensive design system from scratch, including components, patterns, and guidelines for consistency across products.",
            rating: 5.0,
            feedback:
              "Exceptional work on our design system. Sarah's attention to detail is unmatched.",
          },
        ],
        education: [
          {
            id: "edu-sarah1",
            degree: "MFA",
            school: "California Institute of the Arts",
            field: "Interaction Design",
            startYear: 2013,
            endYear: 2015,
          },
        ],
      },
      {
        id: "mikej",
        name: "Mike J.",
        title: "DevOps Engineer",
        avatar: "",
        location: "Austin, TX",
        hourlyRate: 85,
        earnings: "$30k+",
        jobsCompleted: 28,
        hoursWorked: 800,
        rating: 4.7,
        available: false,
        skills: ["AWS", "Docker", "Kubernetes", "CI/CD", "Terraform"],
        description:
          "Cloud infrastructure specialist helping teams scale their applications. AWS certified with expertise in containerization and infrastructure as code.",
        employmentHistory: [
          {
            id: "job-mike1",
            title: "DevOps Lead for E-learning Platform",
            company: "EduTech Global",
            startDate: "2023-01",
            endDate: "2023-07",
            description:
              "Migrated legacy infrastructure to AWS, implemented CI/CD pipelines, and reduced deployment time by 80%. Managed Kubernetes clusters serving 2M+ users.",
            rating: 4.9,
            feedback:
              "Mike transformed our infrastructure. His expertise in cloud architecture is outstanding.",
          },
          {
            id: "job-mike2",
            title: "Cloud Infrastructure Automation",
            company: "StreamMedia Inc",
            startDate: "2022-06",
            endDate: "2022-12",
            description:
              "Automated infrastructure provisioning using Terraform and implemented monitoring solutions. Achieved 99.99% uptime for critical services.",
            rating: 4.8,
            feedback:
              "Excellent DevOps engineer. Mike's automation saved us thousands of hours.",
          },
        ],
        education: [
          {
            id: "edu-mike1",
            degree: "BS",
            school: "University of Texas at Austin",
            field: "Computer Engineering",
            startYear: 2012,
            endYear: 2016,
          },
        ],
      },
    ],
    jobs: [
      {
        id: "job-ecom",
        title: "E-commerce Platform Development",
        description:
          "Need a full-stack developer to build a custom e-commerce platform with React frontend and Node.js backend. The platform should support multiple vendors, real-time inventory tracking, and integrate with Stripe for payments. We need someone who can handle both the technical implementation and provide input on the architecture.",
        client: "Tech Startup Inc",
        posted: "2 hours ago",
        budget: "$5,000 - $10,000",
        duration: "1-3 months",
        experienceLevel: "Expert",
        category: "Web Development",
        skills: ["React", "Node.js", "PostgreSQL", "AWS", "Stripe API"],
        proposals: 12,
        status: "open",
      },
      {
        id: "job-mobile",
        title: "Mobile App Development for iOS and Android",
        description:
          "Looking for experienced mobile developer to create a cross-platform app for our fitness startup. The app should include workout tracking, nutrition logging, social features, and integration with wearable devices. Experience with React Native and health APIs is essential.",
        client: "FitLife Solutions",
        posted: "5 hours ago",
        budget: "$8,000 - $15,000",
        duration: "2-4 months",
        experienceLevel: "Expert",
        category: "Mobile Development",
        skills: [
          "React Native",
          "TypeScript",
          "Firebase",
          "iOS",
          "Android",
          "HealthKit",
        ],
        proposals: 8,
        status: "open",
      },
    ],
    contracts: [
      {
        id: "4ea77024-5c19-4fc6-b1cc-6c95e0db7d7d",
        freelancerId: "charlesdavis",
        jobId: "job-ecom",
        title: "E-commerce Platform Development",
        type: "fixed",
        fixedPrice: 7500,
        automaticPayment: 2500,
        description:
          "Build a modern e-commerce platform with multi-vendor support. Must include real-time inventory tracking, Stripe integration, and mobile-responsive design. Please provide weekly progress updates and ensure the codebase is well-documented.",
        status: "pending",
        hiringTeam: "Tech Startup Inc",
      },
    ],
    messages: [
      {
        id: "msg1",
        senderId: "charlesdavis",
        recipientId: "client1",
        content:
          "Hi! I'm excited about your e-commerce project. I have extensive experience building similar multi-vendor platforms with React and Node.js. I've successfully implemented Stripe integrations and real-time inventory systems for several clients.",
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg2",
        senderId: "client1",
        recipientId: "charlesdavis",
        content:
          "Great to hear! Your experience looks perfect for what we need. Can you share more about your approach to building scalable e-commerce architectures?",
        timestamp: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg3",
        senderId: "charlesdavis",
        recipientId: "client1",
        content:
          "Absolutely! I typically use a microservices approach with separate services for inventory, orders, and payments. This ensures scalability and maintainability. I also implement comprehensive testing and documentation. I can start immediately and provide weekly progress updates.",
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg4",
        senderId: "client1",
        recipientId: "charlesdavis",
        content:
          "That sounds perfect! Your technical approach aligns exactly with what we're looking for. I'm sending you a contract offer now.",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg5",
        senderId: "client1",
        recipientId: "charlesdavis",
        content: "Contract offer sent for E-commerce Platform Development",
        timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
        contractId: "4ea77024-5c19-4fc6-b1cc-6c95e0db7d7d",
      },
      {
        id: "msg6",
        senderId: "sarahw",
        recipientId: "client1",
        content:
          "Hi there! I noticed you have an e-commerce project in development. I'd love to collaborate on the UI/UX design to ensure a seamless user experience. I have extensive experience designing e-commerce platforms that convert.",
        timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      },
      {
        id: "msg7",
        senderId: "client1",
        recipientId: "sarahw",
        content:
          "Hi Sarah! Thanks for reaching out. We're definitely going to need UI/UX help once the initial development is underway. Your portfolio looks impressive!",
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ],
  },
};
