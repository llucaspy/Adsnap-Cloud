'use client'

import { useState, useEffect } from 'react'
import {
    Users,
    UserPlus,
    Shield,
    ShieldAlert,
    Trash2,
    CheckCircle2,
    XCircle,
    Search,
    RefreshCw,
    X
} from 'lucide-react'

interface User {
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
    createdAt: string
}

export function AdminView() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [showAddModal, setShowAddModal] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'user'
    })
    const [formLoading, setFormLoading] = useState(false)
    const [formError, setFormError] = useState('')

    useEffect(() => {
        fetchUsers()
    }, [])

    const fetchUsers = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/users')
            const data = await res.json()
            if (res.ok) {
                setUsers(data.users)
            }
        } catch (error) {
            console.error('Failed to fetch users:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setFormLoading(true)
        setFormError('')

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário')

            setUsers([data.user, ...users])
            setShowAddModal(false)
            setFormData({ name: '', email: '', password: '', role: 'user' })
        } catch (err: any) {
            setFormError(err.message)
        } finally {
            setFormLoading(false)
        }
    }

    const toggleUserStatus = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentStatus })
            })
            if (res.ok) {
                setUsers(users.map(u => u.id === id ? { ...u, isActive: !currentStatus } : u))
            }
        } catch (error) {
            console.error('Failed to toggle status:', error)
        }
    }

    const deleteUser = async (id: string) => {
        if (!confirm('Deseja realmente excluir este usuário permanentemente?')) return

        try {
            const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
            if (res.ok) {
                setUsers(users.filter(u => u.id !== id))
            } else {
                const data = await res.json()
                alert(data.error || 'Erro ao deletar usuário')
            }
        } catch (error) {
            console.error('Failed to delete user:', error)
        }
    }

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-accent transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou e-mail..."
                        className="w-full h-12 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl outline-none focus:border-accent/40 focus:bg-white/10 transition-all text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={fetchUsers}
                        className="p-3 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all text-white/60"
                        title="Recarregar"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-accent to-purple-600 rounded-2xl font-bold text-white shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <UserPlus size={18} />
                        Novo Acesso
                    </button>
                </div>
            </div>

            {/* Users Table Card */}
            <div className="glass rounded-[32px] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-bottom border-white/5 bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/30">Usuário</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/30">Privilégio</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/30">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/30">Data</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/30 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading && users.length === 0 ? (
                                Array(3).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-6 py-8 h-20 bg-white/[0.01]" />
                                    </tr>
                                ))
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-white/20 italic">
                                        Nenhum usuário encontrado
                                    </td>
                                </tr>
                            ) : filteredUsers.map((user) => (
                                <tr key={user.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-bold">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-white">{user.name}</span>
                                                <span className="text-xs text-white/40">{user.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${user.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                            }`}>
                                            {user.role === 'admin' ? <Shield size={10} /> : <Users size={10} />}
                                            {user.role}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => toggleUserStatus(user.id, user.isActive)}
                                            className={`flex items-center gap-1.5 text-xs font-semibold ${user.isActive ? 'text-emerald-400' : 'text-rose-400 hover:text-rose-300'}`}
                                        >
                                            {user.isActive ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
                                            {user.isActive ? 'Ativo' : 'Bloqueado'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-white/40 font-medium">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => deleteUser(user.id)}
                                                className="p-2 mr-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Criação */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="glass w-full max-w-md rounded-[32px] p-8 space-y-6 relative border border-white/10 shadow-2xl">
                        <button
                            onClick={() => setShowAddModal(false)}
                            className="absolute right-6 top-6 text-white/20 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="text-center space-y-2">
                            <h2 className="text-xl font-bold text-white tracking-tight">Novo Acesso Nexus</h2>
                            <p className="text-xs text-white/40">Defina os privilégios do novo colaborador</p>
                        </div>

                        {formError && (
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium text-center">
                                {formError}
                            </div>
                        )}

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Nome Completo</label>
                                <input
                                    type="text"
                                    className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-xl outline-none focus:border-accent transition-all text-sm"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">E-mail de Login</label>
                                <input
                                    type="text"
                                    className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-xl outline-none focus:border-accent transition-all text-sm"
                                    required
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Senha Inicial</label>
                                <input
                                    type="password"
                                    className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-xl outline-none focus:border-accent transition-all text-sm"
                                    required
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5 pb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Nível de Acesso</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: 'user' })}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-bold transition-all ${formData.role === 'user' ? 'bg-accent/10 border-accent text-accent' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        <Users size={14} />
                                        Usuário
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: 'admin' })}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-bold transition-all ${formData.role === 'admin' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        <Shield size={14} />
                                        Admin
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={formLoading}
                                className="w-full h-12 bg-gradient-to-r from-accent to-purple-600 rounded-xl font-bold text-white shadow-xl shadow-accent/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {formLoading ? 'Processando...' : 'Finalizar Cadastro'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
