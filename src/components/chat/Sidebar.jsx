import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    LuFolder, LuFolderPlus, LuPlus, LuTrash2, LuPencil,
    LuMessageSquare, LuCheck, LuX,
    LuLayoutDashboard, LuFolderOpen, LuStretchHorizontal
} from "react-icons/lu";

export default function Sidebar({
    sessions,
    folders,
    activeSession,
    onSelectSession,
    onCreateSession,
    onCreateFolder,
    onDeleteFolder,
    onRenameSession,
    onDeleteSession,
    onMoveSession
}) {
  const navigate = useNavigate();

  // Local UI State
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuOpenId, setMenuOpenId] = useState(null);

  const menuRef = useRef(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- UI ACTIONS ---

  const handleCreateFolder = () => {
    const name = prompt("Enter folder name:");
    if (name) onCreateFolder(name);
  };

  const handleDeleteFolder = (id) => {
    if (window.confirm("Delete folder? Chats inside will be moved to General.")) {
      onDeleteFolder(id);
    }
  };

  const handleDeleteSession = (id, e) => {
    e.stopPropagation();
    if (window.confirm("Delete this chat permanently?")) {
      onDeleteSession(id);
      setMenuOpenId(null);
    }
  };

  const startRename = (id, currentTitle, e) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle || "");
    setMenuOpenId(null);
  };

  const saveRename = (id) => {
    if (editTitle.trim()) {
        onRenameSession(id, editTitle);
    }
    setEditingId(null);
  };

  const handleMove = (sessionId, folderId) => {
    onMoveSession(sessionId, folderId);
    setMenuOpenId(null);
  };


  // --- RENDER HELPER ---
  const renderSessionItem = (s) => {
    const isEditing = editingId === s.id;
    const isMenuOpen = menuOpenId === s.id;
    const isActive = activeSession === s.id;

    return (
      <div
        key={s.id}
        className={`group relative flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-all border border-transparent ${
          isActive 
            ? "bg-white border-gray-200 shadow-sm text-gray-900 font-medium" 
            : "hover:bg-gray-200/50 text-gray-600 hover:text-gray-900"
        }`}
        onClick={() => !isEditing && onSelectSession(s.id)}
      >
        <LuMessageSquare size={16} className={`shrink-0 ${isActive ? "text-blue-500" : "text-gray-400"}`} />

        {/* EDIT MODE */}
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 z-20">
            <input
              className="w-full border border-blue-300 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.key === 'Enter' && saveRename(s.id)}
              autoFocus
            />
            <button onClick={(e) => { e.stopPropagation(); saveRename(s.id); }} className="text-green-600 hover:bg-green-100 p-0.5 rounded"><LuCheck size={14}/></button>
            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-red-500 hover:bg-red-100 p-0.5 rounded"><LuX size={14}/></button>
          </div>
        ) : (
          /* DISPLAY MODE */
          <span className="truncate flex-1">{s.title || "New Chat"}</span>
        )}

        {/* MENU BUTTON */}
        {!isEditing && (
          <div className="relative">
            <button
              onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(isMenuOpen ? null : s.id);
              }}
              className={`p-1 rounded-md hover:bg-gray-300 transition-opacity ${
                  isMenuOpen || isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <LuStretchHorizontal size={16} />
            </button>

            {/* DROPDOWN MENU */}
            {isMenuOpen && (
              <div
                ref={menuRef}
                className="absolute right-0 top-8 w-48 bg-white shadow-xl border border-gray-100 rounded-lg z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider bg-gray-50/50">Options</div>

                <button onClick={(e) => startRename(s.id, s.title, e)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-gray-700 flex gap-2 items-center">
                  <LuPencil size={12} className="text-blue-500"/> Rename
                </button>

                <div className="border-t my-1"></div>

                <p className="px-3 py-1 text-[10px] text-gray-400 uppercase font-bold">Move to</p>
                <button onClick={() => handleMove(s.id, null)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-600 flex gap-2">
                   <LuFolderOpen size={12}/> General (No Folder)
                </button>
                {folders.map(f => (
                  <button key={f.id} onClick={() => handleMove(s.id, f.id)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-600 flex gap-2 truncate">
                    <LuFolder size={12}/> {f.name}
                  </button>
                ))}

                <div className="border-t my-1"></div>
                <button onClick={(e) => handleDeleteSession(s.id, e)} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex gap-2 items-center">
                  <LuTrash2 size={12} /> Delete Chat
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const unorganizedSessions = sessions.filter(s => !s.folder_id);

  return (
    <div className="w-72 bg-gray-50/80 backdrop-blur-sm border-r border-gray-200 flex flex-col h-full shrink-0">

      {/* 1. New Chat Button */}
      <div className="p-4">
        <button
            onClick={onCreateSession}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white p-3 rounded-xl hover:bg-black transition-all shadow-md active:scale-95 text-sm font-medium"
        >
          <LuPlus size={18} /> New Chat
        </button>
      </div>

      {/* 2. List Area */}
      <div className="flex-1 overflow-y-auto px-3 space-y-6 pb-4 scrollbar-thin scrollbar-thumb-gray-200">

        {/* A. Folders */}
        {folders.length > 0 && (
            <div className="space-y-4">
                {folders.map(f => {
                    const folderSessions = sessions.filter(s => s.folder_id === f.id);
                    return (
                        <div key={f.id}>
                            <div className="flex items-center justify-between px-2 py-1 mb-1 group">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <LuFolder className="text-gray-400 fill-gray-200"/> {f.name}
                                </div>
                                <button
                                    onClick={() => handleDeleteFolder(f.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded transition-all"
                                    title="Delete Folder"
                                >
                                    <LuTrash2 size={12}/>
                                </button>
                            </div>

                            <div className="space-y-0.5">
                                {folderSessions.length === 0 && (
                                    <div className="px-2 py-2 text-xs text-gray-400 italic border border-dashed border-gray-200 rounded-lg ml-2">
                                        Empty
                                    </div>
                                )}
                                {folderSessions.map(renderSessionItem)}
                            </div>
                        </div>
                    )
                })}
            </div>
        )}

        {/* B. General / Recent Chats */}
        <div>
            <div className="flex items-center justify-between px-2 py-1 mb-1 sticky top-0 bg-gray-50/95 z-10 backdrop-blur">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">All Chats</span>
                <button
                    onClick={handleCreateFolder}
                    className="p-1.5 hover:bg-white hover:shadow-sm text-gray-500 rounded-md transition-all border border-transparent hover:border-gray-200"
                    title="Create Folder"
                >
                    <LuFolderPlus size={14}/>
                </button>
            </div>
            <div className="space-y-0.5">
                {unorganizedSessions.length === 0 && folders.length === 0 && (
                    <p className="text-center text-gray-400 text-xs py-4">No chats yet.</p>
                )}
                {unorganizedSessions.map(renderSessionItem)}
            </div>
        </div>
      </div>

      {/* 3. Footer */}
      <div className="p-4 border-t border-gray-200 bg-white/50">
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center gap-3 p-3 rounded-xl text-gray-600 hover:bg-white hover:shadow-sm hover:text-gray-900 transition-all border border-transparent hover:border-gray-200"
        >
          <div className="bg-gray-100 p-1.5 rounded-lg text-gray-500">
             <LuLayoutDashboard size={18} />
          </div>
          <span className="text-sm font-medium">Dashboard</span>
        </button>
      </div>
    </div>
  );
}
