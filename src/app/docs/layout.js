export const metadata = {
    title: 'Documentation - AutoDocs',
    description: 'View your generated documentation',
  };
  
  export default function DocsLayout({ children }) {
    return (
      <div className="min-h-screen bg-black text-gray-100">
        {children}
      </div>
    );
  }