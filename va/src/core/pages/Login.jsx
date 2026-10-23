import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { Campo } from '../components/ui';

export default function Login() {
  const { toast, online } = useApp();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!online) return toast('É preciso internet para o primeiro acesso.', 'erro');
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) toast(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message, 'erro');
  }

  return (
    <div className="login">
      <div className="login-caixa">
        <div className="login-logo">
          <img src="/icon.svg" alt="" />
          <div className="logo-txt"><span className="va">VA</span></div>
        </div>
        <p className="login-sub">Gestão agropecuária</p>
        <form onSubmit={entrar}>
          <Campo label="E-mail">
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Campo>
          <Campo label="Senha">
            <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          <button className="btn" disabled={entrando}><LogIn size={18} /> {entrando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  );
}
